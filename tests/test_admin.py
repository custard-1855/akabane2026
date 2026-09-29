import csv
import io
import sqlite3

from fastapi.testclient import TestClient

from core.admin import create_admin_app
from tests.conftest import HEADERS


def answer(session, **answers):
    return {"version": 2, "sessionId": session, "durationMs": 1000, "answers": answers}


def test_ループバック以外は拒否する(apps_dir, data_dir):
    with TestClient(create_admin_app(apps_dir, data_dir)) as c:  # TestClient の接続元は "testclient"
        assert c.get("/").status_code == 403
        assert c.get("/api/overview").status_code == 403


def test_DBがなくても画面とAPIが動く(admin):
    assert admin.get("/").status_code == 200
    assert admin.get("/surveys").status_code == 200
    assert admin.get("/api/overview").json()["connected"] == []
    assert admin.get("/api/surveys").json() == []


def test_監視(client, admin):
    client.post("/api/core/devices", json={"userAgent": "UA", "name": "iPad"}, headers=HEADERS)
    client.get("/api/with-api/echo?x=1", headers=HEADERS)
    client.get("/api/with-api/boom", headers=HEADERS)

    data = admin.get("/api/overview?minutes=60").json()
    [dev] = data["connected"]
    assert (dev["name"], dev["userAgent"], dev["lastApp"]) == ("iPad", "UA", "with-api")

    apps = {a["app"]: a for a in data["apps"]}
    assert apps["with-api"]["count"] == 2 and apps["with-api"]["errors5xx"] == 1
    routes = {(r["method"], r["route"]) for r in data["routes"]}
    assert ("GET", "/api/with-api/echo") in routes
    assert ("POST", "/api/core/devices") in routes
    assert [e["status"] for e in data["errors"]] == [500]


def test_管理サーバはDBを書き換えない(client, admin, data_dir):
    client.get("/api/core/health")
    admin.get("/api/overview")
    admin.get("/api/surveys")
    # 読み取り専用接続なので、管理サーバ経由の書き込み経路はない。DB が壊れていないことだけ確認する
    assert sqlite3.connect(data_dir / "metrics.db").execute("PRAGMA integrity_check").fetchone() == ("ok",)


def test_アンケート集計とCSV(client, admin):
    client.post("/api/core/surveys/with-api", json=answer("s-000001", rate=5, pick="A", many=["x", "y"], note="a,b"), headers=HEADERS)
    client.post("/api/core/surveys/with-api", json=answer("s-000002", rate=3, many=["y"]), headers=HEADERS)

    [row] = admin.get("/api/surveys").json()
    assert (row["app"], row["version"], row["count"], row["isCurrent"]) == ("with-api", 2, 2, True)

    s = admin.get("/api/surveys/with-api/2").json()
    q = {x["id"]: x for x in s["questions"]}
    assert q["rate"]["mean"] == 4.0
    assert [c["count"] for c in q["rate"]["counts"]] == [0, 0, 1, 0, 1]
    assert q["pick"]["counts"] == [{"label": "A", "count": 1}, {"label": "B", "count": 0}]
    assert q["many"]["counts"] == [{"label": "x", "count": 1}, {"label": "y", "count": 2}, {"label": "z", "count": 0}]
    assert q["note"]["texts"] == ["a,b"]
    assert admin.get("/api/surveys/with-api/9").status_code == 404

    r = admin.get("/api/surveys/with-api/2/csv")
    assert r.headers["content-disposition"] == 'attachment; filename="with-api-v2.csv"'
    assert r.text.startswith("﻿")
    rows = list(csv.reader(io.StringIO(r.text.lstrip("﻿"))))
    assert rows[0] == ["submitted_at", "session_id", "device_id", "duration_ms", "rate", "pick", "many", "note"]
    assert rows[1][1:] == ["s-000001", HEADERS["X-Device-Id"], "1000", "5", "A", "x;y", "a,b"]
    assert rows[2][4:] == ["3", "", "y", ""]
