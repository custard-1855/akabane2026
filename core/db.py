"""SQLite の接続とスキーマ。接続はリクエストごとに開き、スレッド間で共有しない(要件 4.3)。"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

STORAGE_SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (
    app TEXT NOT NULL,
    device_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (app, device_id, key)
);
CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY,
    app TEXT NOT NULL,
    version INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    duration_ms INTEGER,
    answers TEXT NOT NULL,
    UNIQUE (app, session_id)
);
"""

METRICS_SCHEMA = """
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY,
    ts REAL NOT NULL,
    device_id TEXT,
    app TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    route TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_ts ON requests (ts);
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    name TEXT,
    user_agent TEXT,
    first_seen REAL NOT NULL,
    last_seen REAL NOT NULL
);
"""


def storage_path(data_dir: Path) -> Path:
    return data_dir / "storage.db"


def metrics_path(data_dir: Path) -> Path:
    return data_dir / "metrics.db"


def init(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    for path, schema in ((storage_path(data_dir), STORAGE_SCHEMA), (metrics_path(data_dir), METRICS_SCHEMA)):
        conn = sqlite3.connect(path)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(schema)
        finally:
            conn.close()


@contextmanager
def connect(path: Path) -> Iterator[sqlite3.Connection]:
    """書き込み用。with を抜けるときにコミットして閉じる。"""
    conn = sqlite3.connect(path, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


@contextmanager
def connect_ro(path: Path) -> Iterator[sqlite3.Connection | None]:
    """管理サーバ用の読み取り専用接続。DB がまだなければ None を返す。"""
    if not path.exists():
        yield None
        return
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
