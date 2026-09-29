"""apps/ 配下のアプリの読み込み(要件 5章)。

読み込みに失敗したアプリは無効にしてログに残し、基盤全体は起動を続ける(要件 6章 ルール3)。
"""

import importlib.util
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter

from core.config import APP_NAME_RE, RESERVED_APP_NAMES
from core.survey_def import SurveyDef

log = logging.getLogger("core.apps")


@dataclass
class App:
    name: str
    title: str
    description: str
    static_dir: Path
    survey: SurveyDef | None = None
    router: APIRouter | None = None


def discover(apps_dir: Path, load_servers: bool = True) -> dict[str, App]:
    """アプリを名前順に読み込む。load_servers=False なら server.py を読まない(管理サーバ用)。"""
    apps: dict[str, App] = {}
    if not apps_dir.is_dir():
        log.warning("apps ディレクトリがありません", extra={"data": {"path": str(apps_dir)}})
        return apps
    for d in sorted(p for p in apps_dir.iterdir() if p.is_dir()):
        try:
            app = _load(d, load_servers)
        except Exception as e:
            log.exception("アプリを無効にしました", extra={"data": {"app": d.name, "reason": str(e)}})
            continue
        if app is not None:
            apps[app.name] = app
    log.info("アプリを読み込みました", extra={"data": {"apps": list(apps)}})
    return apps


def _load(d: Path, load_servers: bool) -> App | None:
    name = d.name
    if name.startswith("."):
        return None
    if not APP_NAME_RE.match(name) or name in RESERVED_APP_NAMES:
        raise ValueError(f"アプリ名 {name!r} は規約違反です([a-z0-9-]+、core は予約語)")
    static_dir = d / "static"
    if not static_dir.is_dir():
        raise ValueError("static/ がありません")

    meta = json.loads((d / "app.json").read_text(encoding="utf-8")) if (d / "app.json").exists() else {}
    survey = None
    if (d / "survey.json").exists():
        survey = SurveyDef.model_validate_json((d / "survey.json").read_text(encoding="utf-8"))

    router = None
    if load_servers and (d / "server.py").exists():
        router = _load_router(name, d / "server.py")

    return App(
        name=name,
        title=meta.get("name", name),
        description=meta.get("description", ""),
        static_dir=static_dir,
        survey=survey,
        router=router,
    )


def _load_router(name: str, path: Path) -> APIRouter:
    module_name = f"akabane_apps.{name.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        del sys.modules[module_name]
        raise
    router = getattr(module, "router", None)
    if not isinstance(router, APIRouter):
        raise TypeError("server.py が router = APIRouter() を公開していません")
    return router
