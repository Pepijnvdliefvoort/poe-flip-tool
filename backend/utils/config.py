import os
# Time in seconds before cache expiration check (default: 30)
CACHE_CHECK_INTERVAL_SECONDS = int(os.getenv("CACHE_CHECK_INTERVAL_SECONDS", "30"))
import json
from pathlib import Path
from ..models import ConfigData
import logging
from backend.persistence import db

log = logging.getLogger("poe-backend")
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

# Try to load config from DB, fallback to file if not present
def load_config() -> ConfigData:
    try:
        db_config = db.load_config_db()
        if db_config:
            return ConfigData.parse_obj(db_config)
    except Exception as e:
        log.error(f"Error loading config from DB: {e}")
    # Fallback to file
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return ConfigData.parse_obj(data)
    except Exception as e:
        log.error(f"Error loading config from file: {e}")
        return ConfigData(league="Standard", trades=[])

def save_config(cfg: ConfigData) -> None:
    # Save to DB
    try:
        db.save_config_db(cfg.league, [t.dict() for t in cfg.trades], cfg.account_name)
    except Exception as e:
        log.error(f"Error saving config to DB: {e}")
    # Also save to file for backup/legacy
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg.dict(), f, indent=2)
    except Exception as e:
        log.error(f"Error saving config to file: {e}")
