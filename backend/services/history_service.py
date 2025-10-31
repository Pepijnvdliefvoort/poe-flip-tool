from backend.utils.config import load_config
from ..trade_logic import historical_cache

def get_price_history_service(have, want, max_points):
    cfg = load_config()
    history = historical_cache.get_history(cfg.league, have, want, max_points)
    trend = historical_cache.get_trend(cfg.league, have, want)
    return {
        "league": cfg.league,
        "have": have,
        "want": want,
        "history": history,
        "trend": trend,
    }
