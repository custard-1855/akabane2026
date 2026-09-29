"""アプリケーションログを JSON 形式・ローテーション付きでファイルに出す(要件 4.4)。"""

import json
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created).astimezone().isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "data", None)
        if extra:
            entry.update(extra)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup(data_dir: Path, filename: str) -> None:
    log_dir = data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(
        log_dir / filename, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("core")
    # テストなどで create_app を繰り返し呼んでもハンドラが重複しないようにする
    for h in list(logger.handlers):
        if getattr(h, "_akabane", False):
            logger.removeHandler(h)
            h.close()
    handler._akabane = True  # type: ignore[attr-defined]
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
