"""管理サーバ(要件 4.7)。監視画面とアンケート集計。閲覧専用で、DB は読み取り専用で開く。

    uv run uvicorn core.admin:app --host 127.0.0.1 --port 3001

--host を 0.0.0.0 に変えてはならない。LAN 内の誰でも管理画面を開ける状態になる。
念のため、ループバック以外からの接続はミドルウェアでも拒否する。
"""

import csv
import io
import json
import logging
import time
from collections import Counter, defaultdict
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from core import db, logs
from core.apps import discover
from core.config import ADMIN_STATIC_DIR, APPS_DIR, CONNECTED_WINDOW_SECONDS, DATA_DIR
from core.survey_def import SurveyDef
from core.web import NoCacheStaticFiles

log = logging.getLogger("core.admin")

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


def _percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    i = min(len(sorted_values) - 1, max(0, round(p * (len(sorted_values) - 1))))
    return sorted_values[i]


def _summarize(durations: list[float]) -> dict:
    s = sorted(durations)
    return {
        "count": len(s),
        "avgMs": round(sum(s) / len(s), 1) if s else 0,
        "p95Ms": round(_percentile(s, 0.95), 1),
        "maxMs": round(s[-1], 1) if s else 0,
    }


def create_admin_app(
    apps_dir: Path = APPS_DIR, data_dir: Path = DATA_DIR, allowed_hosts: frozenset[str] = LOOPBACK_HOSTS
) -> FastAPI:
    logs.setup(data_dir, "admin.log")
    storage_db = db.storage_path(data_dir)
    metrics_db = db.metrics_path(data_dir)
    # 集計の設問定義に使う。アプリの server.py は読み込まない。
    apps = discover(apps_dir, load_servers=False)

    app = FastAPI(title="akabane2026 admin", docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def loopback_only(request: Request, call_next):
        host = request.client.host if request.client else None
        if host not in allowed_hosts:
            log.warning("ループバック以外からの接続を拒否しました", extra={"data": {"host": host}})
            return JSONResponse({"detail": "管理サーバは Mac 本体からのみ利用できます"}, status_code=403)
        return await call_next(request)

    # --- 画面 ---

    @app.get("/", include_in_schema=False)
    def monitor_page():
        return FileResponse(ADMIN_STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})

    @app.get("/surveys", include_in_schema=False)
    def surveys_page():
        return FileResponse(ADMIN_STATIC_DIR / "surveys.html", headers={"Cache-Control": "no-cache"})

    # --- 監視 ---

    @app.get("/api/overview")
    def overview(minutes: int = 60):
        now = time.time()
        since = now - minutes * 60
        result: dict = {"now": now, "minutes": minutes, "connected": [], "apps": [], "routes": [], "errors": []}
        with db.connect_ro(metrics_db) as conn:
            if conn is None:
                return result

            devices = {r["device_id"]: dict(r) for r in conn.execute("SELECT * FROM devices")}
            recent = conn.execute(
                "SELECT device_id, MAX(ts) AS last_ts, COUNT(*) AS n FROM requests"
                " WHERE ts >= ? AND device_id IS NOT NULL GROUP BY device_id ORDER BY last_ts DESC",
                (now - CONNECTED_WINDOW_SECONDS,),
            ).fetchall()
            for r in recent:
                last_app = conn.execute(
                    "SELECT app FROM requests WHERE device_id = ? AND app != 'core' ORDER BY ts DESC LIMIT 1",
                    (r["device_id"],),
                ).fetchone()
                d = devices.get(r["device_id"], {})
                result["connected"].append(
                    {
                        "deviceId": r["device_id"],
                        "name": d.get("name"),
                        "userAgent": d.get("user_agent"),
                        "lastSeen": r["last_ts"],
                        "lastApp": last_app["app"] if last_app else None,
                        "requests": r["n"],
                    }
                )

            by_app: dict[str, list[float]] = defaultdict(list)
            app_errors: Counter[str] = Counter()
            by_route: dict[tuple[str, str, str], list[float]] = defaultdict(list)
            for r in conn.execute(
                "SELECT app, method, route, status, duration_ms FROM requests WHERE ts >= ?", (since,)
            ):
                by_app[r["app"]].append(r["duration_ms"])
                if r["status"] >= 500:
                    app_errors[r["app"]] += 1
                if r["route"].startswith("/api/"):
                    by_route[(r["app"], r["method"], r["route"])].append(r["duration_ms"])
            result["apps"] = sorted(
                ({"app": k, "errors5xx": app_errors[k], **_summarize(v)} for k, v in by_app.items()),
                key=lambda x: -x["count"],
            )
            result["routes"] = sorted(
                ({"app": a, "method": m, "route": rt, **_summarize(v)} for (a, m, rt), v in by_route.items()),
                key=lambda x: -x["count"],
            )
            result["errors"] = [
                dict(r)
                for r in conn.execute(
                    "SELECT ts, device_id, app, method, path, status, duration_ms FROM requests"
                    " WHERE ts >= ? AND status >= 400 ORDER BY ts DESC LIMIT 100",
                    (since,),
                )
            ]
        return result

    # --- アンケート集計 ---

    def load_responses(app_name: str, version: int) -> list[dict]:
        with db.connect_ro(storage_db) as conn:
            if conn is None:
                return []
            rows = conn.execute(
                "SELECT session_id, device_id, submitted_at, duration_ms, answers FROM survey_responses"
                " WHERE app = ? AND version = ? ORDER BY submitted_at",
                (app_name, version),
            ).fetchall()
        return [{**dict(r), "answers": json.loads(r["answers"])} for r in rows]

    def definition(app_name: str, version: int) -> SurveyDef | None:
        a = apps.get(app_name)
        if a and a.survey and a.survey.version == version:
            return a.survey
        return None

    def question_columns(app_name: str, version: int, responses: list[dict]) -> list[dict]:
        """設問の一覧。現行の定義と版が違えば、回答に含まれる設問 id から作る。"""
        d = definition(app_name, version)
        if d:
            return [{"id": q.id, "type": q.type, "text": q.text, "question": q} for q in d.questions]
        ids: dict[str, None] = {}
        for r in responses:
            ids.update(dict.fromkeys(r["answers"]))
        return [{"id": i, "type": "unknown", "text": i, "question": None} for i in ids]

    @app.get("/api/surveys")
    def survey_list():
        with db.connect_ro(storage_db) as conn:
            rows = (
                conn.execute(
                    "SELECT app, version, COUNT(*) AS n, MAX(submitted_at) AS last FROM survey_responses"
                    " GROUP BY app, version ORDER BY app, version DESC"
                ).fetchall()
                if conn
                else []
            )
        return [
            {
                "app": r["app"],
                "title": apps[r["app"]].title if r["app"] in apps else r["app"],
                "version": r["version"],
                "count": r["n"],
                "lastSubmittedAt": r["last"],
                "isCurrent": definition(r["app"], r["version"]) is not None,
            }
            for r in rows
        ]

    @app.get("/api/surveys/{app_name}/{version}")
    def survey_summary(app_name: str, version: int):
        responses = load_responses(app_name, version)
        if not responses:
            raise HTTPException(404, "回答がありません")
        questions = []
        for col in question_columns(app_name, version, responses):
            q = col["question"]
            values = [r["answers"].get(col["id"]) for r in responses]
            values = [v for v in values if v not in (None, "", [])]
            item = {"id": col["id"], "type": col["type"], "text": col["text"], "answered": len(values)}
            if col["type"] == "text":
                item["texts"] = values
            else:
                counts: Counter = Counter()
                for v in values:
                    for x in v if isinstance(v, list) else [v]:
                        counts[json.dumps(x, ensure_ascii=False) if not isinstance(x, str) else x] += 1
                if q is not None and q.type in ("single", "multi"):
                    keys = q.options
                elif q is not None and q.type == "scale":
                    keys = [str(i) for i in range(q.min, q.max + 1)]
                else:
                    keys = sorted(counts)
                item["counts"] = [{"label": k, "count": counts.get(k, 0)} for k in keys]
                if q is not None and q.type == "scale" and values:
                    item["mean"] = round(sum(values) / len(values), 2)
                    item["minLabel"], item["maxLabel"] = q.min_label, q.max_label
            questions.append(item)
        return {
            "app": app_name,
            "title": apps[app_name].title if app_name in apps else app_name,
            "version": version,
            "count": len(responses),
            "questions": questions,
        }

    @app.get("/api/surveys/{app_name}/{version}/csv")
    def survey_csv(app_name: str, version: int):
        responses = load_responses(app_name, version)
        cols = question_columns(app_name, version, responses)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["submitted_at", "session_id", "device_id", "duration_ms", *[c["id"] for c in cols]])
        for r in responses:
            cells = []
            for c in cols:
                v = r["answers"].get(c["id"])
                cells.append(";".join(map(str, v)) if isinstance(v, list) else "" if v is None else v)
            w.writerow([r["submitted_at"], r["session_id"], r["device_id"], r["duration_ms"], *cells])
        # Excel で文字化けしないよう BOM 付き UTF-8 にする
        return Response(
            "﻿" + buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{app_name}-v{version}.csv"'},
        )

    app.mount("/static", NoCacheStaticFiles(directory=ADMIN_STATIC_DIR), name="static")
    return app


app = create_admin_app()
