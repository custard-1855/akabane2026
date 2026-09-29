"""全リクエストの記録(要件 4.4)。複数ワーカーでも集計できるよう、メモリではなく metrics.db に書く。"""

import logging
import re
import time
from pathlib import Path

from fastapi import FastAPI, Request
from starlette.concurrency import run_in_threadpool

from core import db
from core.config import DEVICE_ID_RE

log = logging.getLogger("core.metrics")

_APP_PATTERNS = [
    re.compile(r"^/api/core/(?:storage|surveys)/(?P<app>[a-z0-9-]+)"),
    re.compile(r"^/api/(?P<app>[a-z0-9-]+)(?:/|$)"),
    re.compile(r"^/apps/(?P<app>[a-z0-9-]+)(?:/|$)"),
]


def app_of(path: str) -> str:
    """パスからアプリ名を決める。基盤自身(ランチャー、/core、/api/core)は "core"。"""
    for pattern in _APP_PATTERNS:
        m = pattern.match(path)
        if m:
            return m["app"]
    return "core"


def _route_of(request: Request) -> str:
    """集計用のルート名(例: /api/core/storage/{app}/{key})。

    scope["route"] のパスはルータの prefix を含まないので、実際のパスから prefix を補う。
    """
    path = request.url.path
    fmt = getattr(request.scope.get("route"), "path_format", None)
    if fmt is None:
        # StaticFiles などのマウントは、マウント先のパスでまとめる
        return request.scope.get("root_path") or path
    try:
        rendered = fmt.format(**request.scope.get("path_params", {}))
    except (KeyError, IndexError, ValueError):
        return path
    return path[: len(path) - len(rendered)] + fmt if path.endswith(rendered) else path


def _record(path: Path, row: tuple) -> None:
    with db.connect(path) as conn:
        conn.execute(
            "INSERT INTO requests (ts, device_id, app, method, path, route, status, duration_ms)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            row,
        )


def purge(data_dir: Path, retention_days: int) -> None:
    with db.connect(db.metrics_path(data_dir)) as conn:
        n = conn.execute("DELETE FROM requests WHERE ts < ?", (time.time() - retention_days * 86400,)).rowcount
    if n:
        log.info("古いリクエスト記録を削除しました", extra={"data": {"deleted": n}})


def install(app: FastAPI, data_dir: Path) -> None:
    metrics_db = db.metrics_path(data_dir)

    @app.middleware("http")
    async def record_request(request: Request, call_next):
        started = time.time()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        except Exception:
            log.exception("未処理の例外", extra={"data": {"path": request.url.path}})
            raise
        finally:
            device = request.headers.get("x-device-id")
            row = (
                started,
                device if device and DEVICE_ID_RE.match(device) else None,
                app_of(request.url.path),
                request.method,
                request.url.path,
                _route_of(request),
                status,
                (time.time() - started) * 1000,
            )
            try:
                await run_in_threadpool(_record, metrics_db, row)
            except Exception:
                # 記録の失敗で本来の応答を落とさない
                log.exception("リクエストの記録に失敗しました")
