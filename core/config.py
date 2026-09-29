"""基盤の設定値。パスは起動時のカレントディレクトリに依存させない(launchd から起動するため)。"""

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPS_DIR = Path(os.environ.get("AKABANE_APPS_DIR", ROOT / "apps"))
DATA_DIR = Path(os.environ.get("AKABANE_DATA_DIR", ROOT / "data"))
CORE_STATIC_DIR = ROOT / "core" / "static"
ADMIN_STATIC_DIR = ROOT / "core" / "admin_static"

APP_NAME_RE = re.compile(r"^[a-z0-9-]+$")
RESERVED_APP_NAMES = {"core"}
DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
STORAGE_KEY_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")

# 未確定事項(要件 10章)。仮の値。
STORAGE_MAX_VALUE_BYTES = 1024 * 1024
SURVEY_TEXT_MAX_CHARS = 1000
METRICS_RETENTION_DAYS = 7
CONNECTED_WINDOW_SECONDS = 5 * 60
