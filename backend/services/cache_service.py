from backend.utils.config import load_config
from ..trade_logic import cache, historical_cache
from datetime import datetime
from ..models import PairSummary, TradesResponse

# Service for /cache/latest_cached

def get_latest_cached_service(top_n):
    cfg = load_config()
    results = []
    now = datetime.utcnow()
    for idx, t in enumerate(cfg.trades):
        key = (cfg.league, t.pay, t.get)
        entry = cache._store.get(key)
        if entry and entry.data:
            trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
            listings = entry.data[:top_n]
            seconds_remaining = (entry.expires_at - now).total_seconds()
            cache_age_seconds = (now - entry.fetched_at).total_seconds() if entry.fetched_at else 0
            median_rate = None
            if listings:
                rates = [l.rate for l in listings]
                if rates:
                    import statistics
                    median_rate = statistics.median(rates)
            summary = PairSummary(
                index=idx,
                get=t.get,
                pay=t.pay,
                hot=t.hot,
                status="ok",
                listings=listings,
                best_rate=(listings[0].rate if listings else None),
                median_rate=median_rate,
                count_returned=len(listings),
                trend=trend_data,
                fetched_at=(entry.fetched_at.isoformat() + 'Z') if entry.fetched_at else None,
            )
        else:
            summary = PairSummary(
                index=idx,
                get=t.get,
                pay=t.pay,
                hot=t.hot,
                status="error",
                listings=[],
                best_rate=None,
                count_returned=0,
                fetched_at=None,
            )
        results.append(summary)
    # Calculate profit margins
    from backend.utils.profit import calculate_profit_margins
    calculate_profit_margins(results)
    return TradesResponse(
        league=cfg.league,
        pairs=len(results),
        results=results
    )

# Service for /cache/status

def get_cache_status_service():
    cfg = load_config()
    result = []
    now = datetime.utcnow()
    for idx, trade in enumerate(cfg.trades):
        key = (cfg.league, trade.pay, trade.get)
        entry = cache._store.get(key)
        if entry:
            is_expired = now >= entry.expires_at
            seconds_remaining = max(0, (entry.expires_at - now).total_seconds())
            result.append({
                "index": idx,
                "have": trade.pay,
                "want": trade.get,
                "cached": True,
                "expired": is_expired,
                "seconds_remaining": round(seconds_remaining, 1),
            })
        else:
            result.append({
                "index": idx,
                "have": trade.pay,
                "want": trade.get,
                "cached": False,
                "expired": True,
                "seconds_remaining": 0,
            })
    return {"pairs": result}

# Service for /cache/expiring

def get_expiring_pairs_service():
    from backend.utils.config import CACHE_CHECK_INTERVAL_SECONDS
    cfg = load_config()
    expired = []
    now = datetime.utcnow()
    for idx, trade in enumerate(cfg.trades):
        key = (cfg.league, trade.pay, trade.get)
        entry = cache._store.get(key)
        if entry:
            seconds_remaining = (entry.expires_at - now).total_seconds()
            if seconds_remaining <= 0:
                expired.append({
                    "index": idx,
                    "have": trade.pay,
                    "want": trade.get,
                    "seconds_remaining": 0,
                    "expired": True
                })
        else:
            expired.append({
                "index": idx,
                "have": trade.pay,
                "want": trade.get,
                "seconds_remaining": 0,
                "expired": True
            })
    return {
        "check_interval_seconds": CACHE_CHECK_INTERVAL_SECONDS,
        "count": len(expired),
        "pairs": expired
    }

# Service for /cache/summary

def cache_summary_service():
    cfg = load_config()
    trade_cache_stats = cache.stats()
    history_stats = historical_cache.stats()
    configured_keys = {(cfg.league, t.pay, t.get) for t in cfg.trades}
    filtered_entries = [e for e in trade_cache_stats.get("entries_detail", []) if (e["league"], e["have"], e["want"]) in configured_keys]
    trade_cache_stats["entries_detail"] = filtered_entries
    return {
        "league": cfg.league,
        "trade_cache": trade_cache_stats,
        "historical": history_stats,
    }
