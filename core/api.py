"""基盤API(/api/core/*)。一般向けサーバには、端末一覧・監視データ・回答を読み出すAPIを置かない(要件 6章 ルール5)。"""

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from core import db
from core.apps import App
from core.config import DEVICE_ID_RE, STORAGE_KEY_RE, STORAGE_MAX_VALUE_BYTES
from core.survey_def import validate_answers


def device_id(x_device_id: Annotated[str | None, Header()] = None) -> str:
    if not x_device_id or not DEVICE_ID_RE.match(x_device_id):
        raise HTTPException(400, "X-Device-Id ヘッダがないか、形式が不正です")
    return x_device_id


DeviceId = Annotated[str, Depends(device_id)]


class DeviceIn(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    user_agent: str | None = Field(default=None, alias="userAgent", max_length=512)


class SurveyResponseIn(BaseModel):
    version: int
    session_id: str = Field(alias="sessionId", pattern=r"^[A-Za-z0-9_-]{8,64}$")
    duration_ms: int | None = Field(default=None, alias="durationMs", ge=0)
    answers: dict[str, Any]


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def build_router(apps: dict[str, App], data_dir: Path) -> APIRouter:
    router = APIRouter(prefix="/api/core")
    storage_db = db.storage_path(data_dir)
    metrics_db = db.metrics_path(data_dir)

    def get_app(app: str) -> App:
        if app not in apps:
            raise HTTPException(404, f"アプリ {app!r} はありません")
        return apps[app]

    def check_key(key: str) -> str:
        if not STORAGE_KEY_RE.match(key):
            raise HTTPException(400, "キーの形式が不正です")
        return key

    # --- ヘルスチェック・アプリ一覧 ---

    @router.get("/health")
    def health():
        with db.connect(storage_db) as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "apps": list(apps)}

    @router.get("/apps")
    def list_apps():
        return [
            {"name": a.name, "title": a.title, "description": a.description, "hasSurvey": a.survey is not None}
            for a in apps.values()
        ]

    # --- 端末 ---

    @router.post("/devices", status_code=204)
    def register_device(body: DeviceIn, device: DeviceId):
        now = time.time()
        with db.connect(metrics_db) as conn:
            conn.execute(
                "INSERT INTO devices (device_id, name, user_agent, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
                " ON CONFLICT (device_id) DO UPDATE SET"
                "  name = COALESCE(excluded.name, devices.name),"
                "  user_agent = COALESCE(excluded.user_agent, devices.user_agent),"
                "  last_seen = excluded.last_seen",
                (device, body.name, body.user_agent, now, now),
            )

    @router.post("/devices/heartbeat", status_code=204)
    def heartbeat(device: DeviceId):
        # 接続状況はリクエスト記録(metrics)から求めるので、ここでは何もしない
        return None

    # --- 保存API ---

    @router.get("/storage/{app}/{key}")
    def storage_get(app: str, key: str, device: DeviceId):
        get_app(app), check_key(key)
        with db.connect(storage_db) as conn:
            row = conn.execute(
                "SELECT value FROM kv WHERE app = ? AND device_id = ? AND key = ?", (app, device, key)
            ).fetchone()
        if row is None:
            raise HTTPException(404, "保存データがありません")
        return Response(row["value"], media_type="application/json")

    @router.put("/storage/{app}/{key}", status_code=204)
    async def storage_put(app: str, key: str, request: Request, device: DeviceId):
        get_app(app), check_key(key)
        body = await request.body()
        if len(body) > STORAGE_MAX_VALUE_BYTES:
            raise HTTPException(413, f"値は {STORAGE_MAX_VALUE_BYTES} バイト以内にしてください")
        try:
            json.loads(body)
        except ValueError:
            raise HTTPException(400, "値が JSON ではありません")

        def write():
            with db.connect(storage_db) as conn:
                conn.execute(
                    "INSERT INTO kv (app, device_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)"
                    " ON CONFLICT (app, device_id, key) DO UPDATE SET"
                    "  value = excluded.value, updated_at = excluded.updated_at",
                    (app, device, key, body.decode("utf-8"), now_iso()),
                )

        await run_in_threadpool(write)

    @router.delete("/storage/{app}/{key}", status_code=204)
    def storage_delete(app: str, key: str, device: DeviceId):
        get_app(app), check_key(key)
        with db.connect(storage_db) as conn:
            conn.execute("DELETE FROM kv WHERE app = ? AND device_id = ? AND key = ?", (app, device, key))

    # --- アンケート ---

    @router.get("/surveys/{app}")
    def survey_get(app: str):
        a = get_app(app)
        if a.survey is None:
            raise HTTPException(404, "このアプリにはアンケートがありません")
        return a.survey.model_dump(by_alias=True, exclude_none=True)

    @router.post("/surveys/{app}", status_code=201)
    def survey_post(app: str, body: SurveyResponseIn, device: DeviceId, response: Response):
        a = get_app(app)
        if a.survey is None:
            raise HTTPException(404, "このアプリにはアンケートがありません")
        if body.version != a.survey.version:
            # 設問が変わった後に古い版の回答が再送された。端末側で破棄させる。
            raise HTTPException(409, f"アンケートの版が違います(現在 {a.survey.version})")
        errors = validate_answers(a.survey, body.answers)
        if errors:
            raise HTTPException(422, errors)
        with db.connect(storage_db) as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO survey_responses"
                " (app, version, session_id, device_id, submitted_at, duration_ms, answers)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    app,
                    body.version,
                    body.session_id,
                    device,
                    now_iso(),
                    body.duration_ms,
                    json.dumps(body.answers, ensure_ascii=False),
                ),
            )
        if cur.rowcount == 0:
            response.status_code = 200
            return {"status": "duplicate"}
        return {"status": "created"}

    return router
