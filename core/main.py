"""一般向けサーバ。

    uv run uvicorn core.main:app --host 0.0.0.0 --port 3000

ルートの登録順は API(/api/*)→ /core → /apps/<app> → / (要件 7章)。
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from core import api, db, logs, metrics
from core.apps import discover
from core.config import APPS_DIR, CORE_STATIC_DIR, DATA_DIR, METRICS_RETENTION_DAYS
from core.web import NoCacheStaticFiles

log = logging.getLogger("core")


def create_app(apps_dir: Path = APPS_DIR, data_dir: Path = DATA_DIR) -> FastAPI:
    logs.setup(data_dir, "core.log")
    db.init(data_dir)
    apps = discover(apps_dir)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        metrics.purge(data_dir, METRICS_RETENTION_DAYS)
        log.info("一般向けサーバを起動しました", extra={"data": {"apps": list(apps)}})
        yield

    app = FastAPI(title="akabane2026", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    metrics.install(app, data_dir)

    app.include_router(api.build_router(apps, data_dir))
    for a in apps.values():
        if a.router is not None:
            app.include_router(a.router, prefix=f"/api/{a.name}", tags=[a.name])

    app.mount("/core", NoCacheStaticFiles(directory=CORE_STATIC_DIR), name="core")
    for a in apps.values():
        app.mount(f"/apps/{a.name}", NoCacheStaticFiles(directory=a.static_dir, html=True), name=f"app-{a.name}")

    @app.get("/", include_in_schema=False)
    def launcher():
        return FileResponse(CORE_STATIC_DIR / "launcher.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
