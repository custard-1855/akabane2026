import json
import sqlite3

import pytest

from core.metrics import app_of
from tests.conftest import DEVICE, HEADERS


def test_ランチャーと健康状態(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "/core/sdk.js" in r.text
    assert r.headers["cache-control"] == "no-cache"

    r = client.get("/api/core/health")
    assert r.json() == {"status": "ok", "apps": ["static-only", "with-api"]}


def test_規約違反と読み込み失敗のアプリは無効になり他は動く(client):
    names = [a["name"] for a in client.get("/api/core/apps").json()]
    assert names == ["static-only", "with-api"]
    assert client.get("/apps/broken/").status_code == 404


def test_アプリ一覧の中身(client):
    apps = {a["name"]: a for a in client.get("/api/core/apps").json()}
    assert apps["with-api"] == {"name": "with-api", "title": "with-api 表示名", "description": "説明", "hasSurvey": True}
    assert apps["static-only"]["hasSurvey"] is False


def test_アプリの静的ファイルとsdk(client):
    r = client.get("/apps/static-only/")
    assert r.status_code == 200 and "static-only" in r.text
    assert r.headers["cache-control"] == "no-cache"
    assert client.get("/apps/static-only", follow_redirects=False).status_code in (307, 308)
    assert "globalThis.core" in client.get("/core/sdk.js").text


def test_計算APIはアプリ名の下に載る(client):
    assert client.get("/api/with-api/echo?x=21").json() == {"x": 42}
    assert client.get("/api/static-only/echo?x=1").status_code == 404


def test_保存APIの読み書き(client):
    url = "/api/core/storage/with-api/progress"
    assert client.get(url, headers=HEADERS).status_code == 404
    assert client.put(url, json={"stars": [3, 2]}, headers=HEADERS).status_code == 204
    assert client.get(url, headers=HEADERS).json() == {"stars": [3, 2]}
    assert client.put(url, content=b"null", headers=HEADERS).status_code == 204
    assert client.get(url, headers=HEADERS).json() is None

    other = {"X-Device-Id": "f" * 32}
    assert client.get(url, headers=other).status_code == 404, "端末ごとに分かれる"

    assert client.delete(url, headers=HEADERS).status_code == 204
    assert client.get(url, headers=HEADERS).status_code == 404


@pytest.mark.parametrize(
    ("method", "url", "kwargs", "status"),
    [
        ("get", "/api/core/storage/with-api/k", {}, 400),  # 端末IDなし
        ("get", "/api/core/storage/with-api/k", {"headers": {"X-Device-Id": "short"}}, 400),
        ("get", "/api/core/storage/nope/k", {"headers": HEADERS}, 404),
        ("get", "/api/core/storage/with-api/bad key", {"headers": HEADERS}, 400),
        ("put", "/api/core/storage/with-api/k", {"headers": HEADERS, "content": b"{not json"}, 400),
        ("put", "/api/core/storage/with-api/k", {"headers": HEADERS, "content": b'"' + b"a" * (1024 * 1024) + b'"'}, 413),
    ],
)
def test_保存APIの入力チェック(client, method, url, kwargs, status):
    assert getattr(client, method)(url, **kwargs).status_code == status


def test_端末登録とハートビート(client, data_dir):
    assert client.post("/api/core/devices", json={"userAgent": "UA1", "name": "iPad"}, headers=HEADERS).status_code == 204
    assert client.post("/api/core/devices", json={"userAgent": "UA2"}, headers=HEADERS).status_code == 204
    assert client.post("/api/core/devices/heartbeat", headers=HEADERS).status_code == 204
    conn = sqlite3.connect(data_dir / "metrics.db")
    assert conn.execute("SELECT name, user_agent FROM devices").fetchall() == [("iPad", "UA2")]


def valid_answer(session="session-0001", **answers):
    return {"version": 2, "sessionId": session, "durationMs": 1234, "answers": answers or {"rate": 4}}


def test_アンケート定義の取得(client):
    s = client.get("/api/core/surveys/with-api").json()
    assert s["version"] == 2
    assert s["questions"][3]["maxLength"] == 10
    assert client.get("/api/core/surveys/static-only").status_code == 404


def test_アンケート回答の保存と二重登録防止(client, data_dir):
    body = valid_answer(rate=5, pick="B", many=["x", "z"], note="よかった")
    r = client.post("/api/core/surveys/with-api", json=body, headers=HEADERS)
    assert r.status_code == 201
    r = client.post("/api/core/surveys/with-api", json=body, headers=HEADERS)
    assert r.status_code == 200 and r.json() == {"status": "duplicate"}

    conn = sqlite3.connect(data_dir / "storage.db")
    rows = conn.execute("SELECT app, version, session_id, device_id, duration_ms, answers FROM survey_responses").fetchall()
    assert len(rows) == 1
    app, version, session, device, duration, answers = rows[0]
    assert (app, version, session, device, duration) == ("with-api", 2, "session-0001", DEVICE, 1234)
    assert json.loads(answers)["many"] == ["x", "z"]


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({**valid_answer(), "version": 1}, 409),
        (valid_answer(pick="B"), 422),  # 必須の rate がない
        (valid_answer(rate=6), 422),
        (valid_answer(rate=True), 422),
        (valid_answer(rate=3, pick="C"), 422),
        (valid_answer(rate=3, many=["x", "x"]), 422),
        (valid_answer(rate=3, note="あ" * 11), 422),
        (valid_answer(rate=3, unknown=1), 422),
        ({**valid_answer(), "sessionId": "x"}, 422),
    ],
)
def test_アンケート回答の検証(client, body, status):
    assert client.post("/api/core/surveys/with-api", json=body, headers=HEADERS).status_code == status


def test_リクエストが記録される(client, data_dir):
    client.get("/api/with-api/echo?x=1", headers=HEADERS)
    client.get("/api/with-api/boom", headers=HEADERS)
    client.get("/apps/static-only/")
    client.put("/api/core/storage/with-api/k1", json=1, headers=HEADERS)
    client.get("/")
    conn = sqlite3.connect(data_dir / "metrics.db")
    rows = conn.execute("SELECT device_id, app, route, status FROM requests ORDER BY id").fetchall()
    assert (DEVICE, "with-api", "/api/with-api/echo", 200) in rows
    assert (DEVICE, "with-api", "/api/with-api/boom", 500) in rows
    assert (None, "static-only", "/apps/static-only", 200) in rows
    assert (DEVICE, "with-api", "/api/core/storage/{app}/{key}", 204) in rows
    assert (None, "core", "/", 200) in rows


@pytest.mark.parametrize(
    ("path", "app"),
    [
        ("/", "core"),
        ("/core/sdk.js", "core"),
        ("/api/core/health", "core"),
        ("/api/core/storage/foo-bar/k", "foo-bar"),
        ("/api/core/surveys/foo", "foo"),
        ("/api/foo/x", "foo"),
        ("/apps/foo/", "foo"),
        ("/apps/foo", "foo"),
    ],
)
def test_パスからアプリ名を決める(path, app):
    assert app_of(path) == app


def test_サンプルアプリの計算API():
    """実際の apps/ を読み込んで、同梱アプリが規約どおりに載ることを確認する。"""
    from fastapi.testclient import TestClient

    from core.main import app

    with TestClient(app) as c:
        names = [a["name"] for a in c.get("/api/core/apps").json()]
        assert {"dijkstra-delivery", "sample-primes"} <= set(names)
        r = c.post("/api/sample-primes/primes", json={"limit": 100})
        assert r.json() == {"limit": 100, "count": 25, "largest": 97}
        assert c.post("/api/sample-primes/primes", json={"limit": 1}).status_code == 422
        assert c.get("/api/core/surveys/dijkstra-delivery").json()["version"] == 1
