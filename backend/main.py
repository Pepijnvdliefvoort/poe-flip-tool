import json
import time
import logging
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import ConfigData, PairSummary, TradesResponse, TradesPatch
from trade_logic import fetch_listings_with_cache, fetch_listings_force
from rate_limiter import rate_limiter

# ============================================================================
# App Initialization & Logging
# ============================================================================

load_dotenv()

# Get log level from environment
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

app = FastAPI(title="PoE Trade Backend")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("poe-backend")

# ============================================================================
# Configuration
# ============================================================================

CONFIG_PATH = Path(__file__).parent / "config.json"

# ============================================================================
# Middleware
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Helper Functions
# ============================================================================

def _load_config() -> ConfigData:
    """Load configuration from config.json"""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return ConfigData.parse_obj(data)
    except Exception as e:
        log.error(f"Error loading config: {e}")
        # Return default config if loading fails
        return ConfigData(league="Standard", trades=[])


def _save_config(cfg: ConfigData) -> None:
    """Save configuration to config.json"""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg.dict(), f, indent=2)

# ============================================================================
# Route Handlers
# ============================================================================

@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "message": "PoE Trade Backend running"}


@app.get("/api/config", response_model=ConfigData)
def get_config():
    """Get current configuration"""
    return _load_config()


@app.put("/api/config", response_model=ConfigData)
def put_config(cfg: ConfigData):
    """Replace entire configuration"""
    _save_config(cfg)
    return cfg


@app.patch("/api/config/league", response_model=ConfigData)
def patch_league(league: str):
    """Update only the league setting"""
    cfg = _load_config()
    cfg.league = league
    _save_config(cfg)
    return cfg


@app.patch("/api/config/account_name", response_model=ConfigData)
def patch_account_name(account_name: str = Body(..., embed=True)):
    """Update only the account_name setting used for highlighting listings"""
    cfg = _load_config()
    cfg.account_name = account_name.strip() or None
    _save_config(cfg)
    return cfg

@app.patch("/api/config/trades", response_model=ConfigData)
def patch_trades(patch: TradesPatch = Body(...)):
    """
    Edit the trades list via JSON body.

    Body shape:
    {
      "add": [{"get":"divine","pay":"chaos"}, {"get":"chaos","pay":"divine"}],
      "remove_indices": [2, 5]
    }
    """
    cfg = _load_config()

    # Remove by indices (remove highest first to maintain correct indices)
    for idx in sorted(patch.remove_indices, reverse=True):
        if 0 <= idx < len(cfg.trades):
            del cfg.trades[idx]

    # Add new pairs
    for pair in patch.add:
        cfg.trades.append(pair)

    _save_config(cfg)
    return cfg


@app.post("/api/trades/refresh_one", response_model=PairSummary)
def refresh_one_trade(
    index: int = Query(..., ge=0),
    top_n: int = Query(5, ge=1, le=20),
):
    """
    Force refresh a single trade pair by index.
    """
    cfg = _load_config()
    
    if not (0 <= index < len(cfg.trades)):
        raise HTTPException(status_code=404, detail="Trade pair not found")
    
    t = cfg.trades[index]
    
    if rate_limiter.blocked:
        return PairSummary(
            index=index,
            get=t.get,
            pay=t.pay,
            hot=t.hot,
            status="rate_limited",
            listings=[],
            best_rate=None,
            count_returned=0,
        )
    
    listings, was_cached = fetch_listings_force(
        league=cfg.league,
        have=t.pay,
        want=t.get,
        top_n=top_n,
    )
    
    if listings is None:
        return PairSummary(
            index=index,
            get=t.get,
            pay=t.pay,
            hot=t.hot,
            status="error",
            listings=[],
            best_rate=None,
            count_returned=0,
        )
    
    # Record snapshot and get trend data from historical cache
    from trade_logic import historical_cache
    if listings:
        historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings)
    trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
    
    return PairSummary(
        index=index,
        get=t.get,
        pay=t.pay,
        hot=t.hot,
        status="ok",
        listings=listings,
        best_rate=(listings[0].rate if listings else None),
        count_returned=len(listings),
        trend=trend_data,
    )


@app.get("/api/trades/stream")
async def stream_trades(
    request: Request,
    delay_s: float = Query(2, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
    force: bool = Query(False),
):
    """
    SSE endpoint for incremental trades loading.
    Set force=true to bypass cache and get fresh data.
    """
    cfg = _load_config()
    
    async def event_generator():
        for idx, t in enumerate(cfg.trades):
            if await request.is_disconnected():
                break
            
            was_cached = False
            
            if rate_limiter.blocked:
                summary = PairSummary(
                    index=idx,
                    get=t.get,
                    pay=t.pay,
                    hot=t.hot,
                    status="rate_limited",
                    listings=[],
                    best_rate=None,
                    count_returned=0,
                )
            else:
                # Use force or cache based on parameter
                if force:
                    listings, was_cached = fetch_listings_force(
                        league=cfg.league,
                        have=t.pay,
                        want=t.get,
                        top_n=top_n,
                    )
                else:
                    listings, was_cached = fetch_listings_with_cache(
                        league=cfg.league,
                        have=t.pay,
                        want=t.get,
                        top_n=top_n,
                    )
                
                if listings is None:
                    summary = PairSummary(
                        index=idx,
                        get=t.get,
                        pay=t.pay,
                        hot=t.hot,
                        status="error",
                        listings=[],
                        best_rate=None,
                        count_returned=0,
                    )
                else:
                    # Record snapshot and get trend data from historical cache
                    from trade_logic import historical_cache
                    if not was_cached and listings:
                        historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings)
                    trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
                    
                    summary = PairSummary(
                        index=idx,
                        get=t.get,
                        pay=t.pay,
                        hot=t.hot,
                        status="ok",
                        listings=listings,
                        best_rate=(listings[0].rate if listings else None),
                        count_returned=len(listings),
                        trend=trend_data,
                    )
            
            log.info(
                f"[SSE {idx}] {t.pay}->{t.get}: status={summary.status} "
                f"best_rate={summary.best_rate} count={summary.count_returned} cached={was_cached}"
            )
            
            yield f"data: {json.dumps(summary.dict())}\n\n"
            
            # Only delay if data was not from cache
            if delay_s and not was_cached:
                import asyncio
                await asyncio.sleep(delay_s)
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/history/{have}/{want}")
def get_price_history(
    have: str,
    want: str,
    max_points: int = Query(default=None, description="Limit number of datapoints returned")
):
    """Get historical price snapshots for a currency pair"""
    from trade_logic import historical_cache
    
    cfg = _load_config()
    history = historical_cache.get_history(cfg.league, have, want, max_points)
    trend = historical_cache.get_trend(cfg.league, have, want)
    
    return {
        "league": cfg.league,
        "have": have,
        "want": want,
        "history": history,
        "trend": trend,
    }


@app.get("/api/cache/status")
def get_cache_status():
    """Get cache expiration status for all configured pairs"""
    from trade_logic import cache
    from datetime import datetime
    
    cfg = _load_config()
    result = []
    
    for idx, trade in enumerate(cfg.trades):
        key = (cfg.league, trade.pay, trade.get)
        entry = cache._store.get(key)
        
        if entry:
            now = datetime.utcnow()
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


@app.get("/api/rate_limit")
def rate_limit_status():
    """Return current rate limit status and parsed rule states for observability."""
    state = rate_limiter.debug_state()
    return {
        "blocked": rate_limiter.blocked,
        "block_remaining": round(rate_limiter.block_remaining, 3),
        "rules": {
            name: [
                {"current": cur, "limit": lim, "reset_s": reset}
                for (cur, lim, reset) in tuples
            ]
            for name, tuples in state.items()
        },
    }


@app.get("/api/cache/summary")
def cache_summary():
    """Aggregate cache + historical stats including per-entry expirations and snapshot counts."""
    from trade_logic import cache, historical_cache
    from persistence import db
    cfg = _load_config()

    trade_cache_stats = cache.stats()
    history_stats = historical_cache.stats()

    # Filter entry details to only configured pairs (in case of stale)
    configured_keys = {(cfg.league, t.pay, t.get) for t in cfg.trades}
    filtered_entries = [e for e in trade_cache_stats.get("entries_detail", []) if (e["league"], e["have"], e["want"]) in configured_keys]
    trade_cache_stats["entries_detail"] = filtered_entries

    return {
        "league": cfg.league,
        "trade_cache": trade_cache_stats,
        "historical": history_stats,
    }


@app.get("/api/database/stats")
def database_stats():
    """Get SQLite database statistics and health info."""
    from persistence import db
    
    try:
        stats = db.get_database_stats()
        return {
            "status": "ok",
            **stats
        }
    except Exception as e:
        log.error(f"Failed to get database stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))