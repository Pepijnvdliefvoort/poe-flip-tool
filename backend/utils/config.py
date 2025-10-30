import os
# Time in seconds before cache expiration check (default: 30)
CACHE_CHECK_INTERVAL_SECONDS = int(os.getenv("CACHE_CHECK_INTERVAL_SECONDS", "30"))
import json
from pathlib import Path
from ..models import ConfigData
import logging
from backend.persistence import db

log = logging.getLogger("poe-backend")

# Try to load config from DB, fallback to file if not present
def load_config(league: str = None) -> ConfigData:
    # If league is not specified, try to get from DB, then file, then fallback to Standard
    log.info(f"[load_config] Requested league: {league}")
    if league is None:
        try:
            league = db.load_last_selected_league()
            log.info(f"[load_config] Loaded last selected league from DB: {league}")
        except Exception as e:
            log.error(f"[load_config] Error loading last selected league from DB: {e}")
            league = "Standard"
    log.info(f"[load_config] Using league: {league}")
    try:
        db_config = db.load_config_db(league)
        if db_config:
            log.info(f"[load_config] Found config in DB for league {league}: {db_config}")
            return ConfigData.parse_obj(db_config)
        else:
            log.warning(f"[load_config] No config found in DB for league {league}")
    except Exception as e:
        log.error(f"[load_config] Error loading config from DB for league {league}: {e}")
    log.error(f"[load_config] Returning empty config for league {league}")
    return ConfigData(league=league, trades=[])

def save_config(cfg: ConfigData) -> None:
    # Save to DB for the specific league
    try:
        db.save_config_db(cfg.league, [t.dict() for t in cfg.trades], cfg.account_name, getattr(cfg, 'thread_id', None))
        db.save_last_selected_league(cfg.league)
    except Exception as e:
        log.error(f"Error saving config to DB: {e}")
