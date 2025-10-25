import os
# Time in seconds before cache expiration check (default: 30)
CACHE_CHECK_INTERVAL_SECONDS = int(os.getenv("CACHE_CHECK_INTERVAL_SECONDS", "30"))
import json
import os
from pathlib import Path
from ..models import ConfigData
import logging

log = logging.getLogger("poe-backend")
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

def load_config() -> ConfigData:
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return ConfigData.parse_obj(data)
    except Exception as e:
        log.error(f"Error loading config: {e}")
        return ConfigData(league="Standard", trades=[])

def save_config(cfg: ConfigData) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg.dict(), f, indent=2)
