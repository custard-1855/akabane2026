import json
import os
import tempfile
from pathlib import Path

# core.main / core.admin はインポート時に既定の data/ でアプリを作るので、先にテスト用へ向ける
os.environ.setdefault("AKABANE_DATA_DIR", tempfile.mkdtemp(prefix="akabane-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from core.admin import LOOPBACK_HOSTS, create_admin_app  # noqa: E402
from core.main import create_app  # noqa: E402

DEVICE = "0123456789abcdef0123456789abcdef"
HEADERS = {"X-Device-Id": DEVICE}

SURVEY = {
    "version": 2,
    "title": "テスト",
    "questions": [
        {"id": "rate", "type": "scale", "text": "満足度", "min": 1, "max": 5, "required": True},
        {"id": "pick", "type": "single", "text": "どれ", "options": ["A", "B"]},
        {"id": "many", "type": "multi", "text": "複数", "options": ["x", "y", "z"]},
        {"id": "note", "type": "text", "text": "自由記述", "maxLength": 10},
    ],
}


def make_app(apps_dir: Path, name: str, *, server: str | None = None, survey: dict | None = None) -> Path:
    d = apps_dir / name
    (d / "static").mkdir(parents=True)
    (d / "static" / "index.html").write_text(f"<h1>{name}</h1>", encoding="utf-8")
    (d / "app.json").write_text(json.dumps({"name": f"{name} 表示名", "description": "説明"}), encoding="utf-8")
    if server is not None:
        (d / "server.py").write_text(server, encoding="utf-8")
    if survey is not None:
        (d / "survey.json").write_text(json.dumps(survey), encoding="utf-8")
    return d


ECHO_SERVER = """
from fastapi import APIRouter
router = APIRouter()

@router.get("/echo")
def echo(x: int):
    return {"x": x * 2}

@router.get("/boom")
def boom():
    raise RuntimeError("boom")
"""


@pytest.fixture
def apps_dir(tmp_path: Path) -> Path:
    d = tmp_path / "apps"
    make_app(d, "static-only")
    make_app(d, "with-api", server=ECHO_SERVER, survey=SURVEY)
    make_app(d, "broken", server="raise ImportError('わざと失敗')")
    make_app(d, "no-router", server="x = 1")
    make_app(d, "Bad_Name")
    make_app(d, "core")
    return d


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture
def client(apps_dir: Path, data_dir: Path):
    with TestClient(create_app(apps_dir, data_dir), raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def admin(apps_dir: Path, data_dir: Path):
    app = create_admin_app(apps_dir, data_dir, allowed_hosts=LOOPBACK_HOSTS | {"testclient"})
    with TestClient(app) as c:
        yield c
