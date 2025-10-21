import json
import time
import logging
from pathlib import Path
from typing import List

from fastapi import FastAPI, Query, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import ConfigData, PairSummary, TradesResponse, TradesPatch
from trade_logic import fetch_listings_with_cache, fetch_listings_force
from rate_limiter import rate_limiter

# ============================================================================
# App Initialization & Logging
# ============================================================================

app = FastAPI(title="PoE Trade Backend")

logging.basicConfig(
    level=logging.INFO,
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

def _generate_trade_url(league: str, want: str, have: str) -> str:
    """Generate PoE trade URL for bulk exchange"""
    league_param = league.replace(" ", "%20")
    return f"https://www.pathofexile.com/trade/exchange/{league_param}?want={want}&have={have}"


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


@app.get("/api/trades", response_model=TradesResponse)
def trades_summary(
    delay_s: float = Query(0.0, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
):
    """
    Cached summary endpoint (fast). Uses per-pair TTL cache to avoid hammering the PoE API.
    """
    cfg = _load_config()
    results: List[PairSummary] = []

    for idx, t in enumerate(cfg.trades):
        trade_url = _generate_trade_url(cfg.league, t.get, t.pay)
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
                trade_url=trade_url,
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
                    trade_url=trade_url,
                )
            else:
                # Get trend data from historical cache
                from trade_logic import historical_cache
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
                    trade_url=trade_url,
                    trend=trend_data,
                )
        
        results.append(summary)
        
        # Only delay if data was not from cache
        if delay_s and not was_cached:
            time.sleep(delay_s)

        log.info(
            f"[GET {idx}] {t.pay}->{t.get}: status={summary.status} "
            f"best_rate={summary.best_rate} count={summary.count_returned} cached={was_cached}"
        )

    return TradesResponse(league=cfg.league, pairs=len(cfg.trades), results=results)


@app.post("/api/trades/refresh", response_model=TradesResponse)
def refresh_trades(
    delay_s: float = Query(0.6, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
):
    """
    Force a fresh fetch for every pair, bypassing cache and updating it with new data.
    """
    cfg = _load_config()
    results: List[PairSummary] = []

    for idx, t in enumerate(cfg.trades):
        trade_url = _generate_trade_url(cfg.league, t.get, t.pay)
        
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
                trade_url=trade_url,
            )
        else:
            # Use fetch_listings_force to bypass cache and get fresh data
            listings, was_cached = fetch_listings_force(
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
                    trade_url=trade_url,
                )
            else:
                # Get trend data from historical cache
                from trade_logic import historical_cache
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
                    trade_url=trade_url,
                    trend=trend_data,
                )
        
        results.append(summary)
        
        if delay_s:
            time.sleep(delay_s)

        log.info(
            f"[REFRESH {idx}] {t.pay}->{t.get}: status={summary.status} "
            f"best_rate={summary.best_rate} count={summary.count_returned}"
        )

    return TradesResponse(league=cfg.league, pairs=len(cfg.trades), results=results)


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
    trade_url = _generate_trade_url(cfg.league, t.get, t.pay)
    
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
            trade_url=trade_url,
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
            trade_url=trade_url,
        )
    
    return PairSummary(
        index=index,
        get=t.get,
        pay=t.pay,
        hot=t.hot,
        status="ok",
        listings=listings,
        best_rate=(listings[0].rate if listings else None),
        count_returned=len(listings),
        trade_url=trade_url,
    )


@app.get("/api/trades/stream")
async def stream_trades(
    request: Request,
    delay_s: float = Query(2, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
):
    """
    SSE endpoint for incremental trades loading.
    """
    cfg = _load_config()
    
    async def event_generator():
        for idx, t in enumerate(cfg.trades):
            if await request.is_disconnected():
                break
            
            trade_url = _generate_trade_url(cfg.league, t.get, t.pay)
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
                    trade_url=trade_url,
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
                        trade_url=trade_url,
                    )
                else:
                    summary = PairSummary(
                        index=idx,
                        get=t.get,
                        pay=t.pay,
                        hot=t.hot,
                        status="ok",
                        listings=listings,
                        best_rate=(listings[0].rate if listings else None),
                        count_returned=len(listings),
                        trade_url=trade_url,
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


@app.get("/api/cache/status")
def cache_status():
    """Return cache status including entry count and expiration times."""
    from trade_logic import cache
    from datetime import datetime
    
    entries = []
    for key, entry in cache._store.items():
        league, have, want = key
        remaining = (entry.expires_at - datetime.utcnow()).total_seconds()
        entries.append({
            "league": league,
            "have": have,
            "want": want,
            "expires_in_seconds": round(remaining, 1),
            "expires_at": entry.expires_at.isoformat(),
            "listing_count": len(entry.data),
        })
    
    return {
        "cache_ttl_seconds": cache.ttl,
        "entry_count": len(entries),
        "entries": sorted(entries, key=lambda x: x["expires_in_seconds"], reverse=True),
    }


@app.post("/api/cache/clear")
def clear_cache():
    """Clear all cache entries."""
    from trade_logic import cache
    cache.clear_all()
    return {"status": "ok", "message": "Cache cleared"}


@app.get("/api/history/{have}/{want}")
def get_price_history(
    have: str,
    want: str,
    league: str = Query("Standard"),
    max_points: int = Query(50, ge=10, le=200),
):
    """Get historical price data for a specific currency pair"""
    from trade_logic import historical_cache
    
    history = historical_cache.get_history(league, have, want, max_points=max_points)
    trend = historical_cache.get_trend(league, have, want)
    
    return {
        "league": league,
        "have": have,
        "want": want,
        "history": history,
        "trend": trend,
    }


@app.get("/api/history/status")
def get_history_status():
    """Get overview of all tracked price histories"""
    from trade_logic import historical_cache
    
    summaries = []
    for key, snapshots in historical_cache._history.items():
        league, have, want = key
        if snapshots:
            trend = historical_cache.get_trend(league, have, want)
            summaries.append({
                "league": league,
                "have": have,
                "want": want,
                "data_points": len(snapshots),
                "trend": trend,
                "oldest": snapshots[0].timestamp.isoformat(),
                "newest": snapshots[-1].timestamp.isoformat(),
            })
    
    return {
        "retention_hours": historical_cache.retention_hours,
        "max_points_per_pair": historical_cache.max_points,
        "tracked_pairs": len(summaries),
        "summaries": summaries,
    }


@app.post("/api/history/clear")
def clear_history():
    """Clear all historical data"""
    from trade_logic import historical_cache
    historical_cache.clear_all()
    return {"status": "ok", "message": "Historical cache cleared"}

