from datetime import datetime
import json
import time
import logging
import os
from pathlib import Path
from typing import List
import requests

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import ConfigData, PairSummary, TradesResponse, TradesPatch
from trade_logic import fetch_listings_with_cache, fetch_listings_force
from rate_limiter import rate_limiter
from trade_logic import HEADERS, COOKIES  # reuse existing headers/cookies for PoE

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
            fetched_at=datetime.utcnow().isoformat() + 'Z',
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
            fetched_at=datetime.utcnow().isoformat() + 'Z',
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
        fetched_at=datetime.utcnow().isoformat() + 'Z',
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
                    fetched_at=datetime.utcnow().isoformat() + 'Z',
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
                        fetched_at=datetime.utcnow().isoformat() + 'Z',
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
                        fetched_at=datetime.utcnow().isoformat() + 'Z',
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


# ============================================================================
# Stash Tab Endpoint
# ============================================================================

@app.get("/api/stash/{tab_name}")
def get_stash_tab(tab_name: str):
    """Retrieve contents of a specific stash tab by name.

    Uses the configured account_name from config.json and current league.
    Performs two requests if necessary:
      1. Fetch tabs metadata to locate tab index by name.
      2. Fetch items for that tab index.

    Returns 404 if the tab cannot be found by name.
    Returns 400 if no account name configured.
    Returns 502 if upstream PoE API fails.
    """
    cfg = _load_config()
    if not cfg.account_name:
        raise HTTPException(status_code=400, detail="No account_name configured in backend config.json")

    league = cfg.league
    account = cfg.account_name

    base_url = "https://www.pathofexile.com/character-window/get-stash-items"

    def _request(params):
        try:
            # Respect existing rate limiter
            rate_limiter.wait_before_request()
            resp = requests.get(base_url, headers=HEADERS, cookies=COOKIES, params=params, timeout=20)
            rate_limiter.on_response(resp.headers)
            if resp.status_code == 429:
                log.warning("Stash API 429 (rate limited)")
                return None, 429
            if resp.status_code != 200:
                log.warning(f"Stash API non-200 {resp.status_code}")
                return None, resp.status_code
            return resp.json(), 200
        except Exception as e:
            log.error(f"Error calling stash API: {e}")
            return None, 0

    # First call: include tabs metadata so we can locate by name.
    meta_params = {
        "accountName": account,
        "league": league,
        "tabIndex": 0,
        "tabs": 1,
    }
    meta_json, code = _request(meta_params)
    if not meta_json:
        raise HTTPException(status_code=502, detail="Failed to fetch stash tabs metadata from PoE API")

    tabs = meta_json.get("tabs") or []
    target = None
    # PoE tab objects usually have keys: id, n (name), i (index)
    for t in tabs:
        name = t.get("n") or t.get("name")
        if isinstance(name, str) and name.lower() == tab_name.lower():
            target = t
            break

    if not target:
        raise HTTPException(status_code=404, detail=f"Stash tab '{tab_name}' not found")

    tab_index = target.get("i")
    if tab_index is None:
        raise HTTPException(status_code=502, detail="PoE API response missing tab index")

    # Second call: fetch items for that tab index, we can omit tabs metadata for speed.
    items_params = {
        "accountName": account,
        "league": league,
        "tabIndex": tab_index,
        "tabs": 0,
    }
    items_json, code = _request(items_params)
    if not items_json:
        raise HTTPException(status_code=502, detail="Failed to fetch stash tab items from PoE API")

    # Build response with minimal helpful structure.
    return {
        "league": league,
        "account": account,
        "tab_name": target.get("n") or target.get("name") or tab_name,
        "tab_index": tab_index,
        "metadata": {
            k: target.get(k) for k in ["type", "colour", "hidden", "selected", "id"] if k in target
        },
        "items_count": len(items_json.get("items", [])),
        "items": items_json.get("items", []),
    }


@app.get("/api/value/latest")
def latest_currency_values():
    """Return latest divine-equivalent value for each configured unique currency.

    Logic:
    For currency X (excluding divine):
      If we have snapshots for pay=X get=divine: best_rate = X per 1 divine => value_per_unit = 1 / best_rate.
      Else if pay=divine get=X: best_rate = divine per 1 X => value_per_unit = best_rate.
      Else value unknown.
    Divine itself is 1.
    """
    cfg = _load_config()
    league = cfg.league
    from trade_logic import historical_cache  # lazy import to avoid circulars

    # Unique currencies from config trades
    currencies = set()
    for t in cfg.trades:
        currencies.add(t.get)
        currencies.add(t.pay)
    # Ensure ordering (stable for clients)
    sorted_currencies = sorted(currencies)

    results = []
    for cur in sorted_currencies:
        if cur == "divine":
            results.append({
                "currency": cur,
                "source": None,
                "raw_best_rate": 1.0,
                "divine_per_unit": 1.0,
                "timestamp": datetime.utcnow().isoformat() + 'Z'
            })
            continue
        # Try pay=cur get=divine first
        key_pay_div = (league, cur, "divine")
        key_div_pay = (league, "divine", cur)
        snapshot = None
        direction = None
        if key_pay_div in historical_cache._history and historical_cache._history[key_pay_div]:
            snapshot = historical_cache._history[key_pay_div][-1]
            direction = "pay->divine"  # X per divine
            raw = snapshot.best_rate
            divine_per_unit = (1 / raw) if raw > 0 else None
            results.append({
                "currency": cur,
                "source": {"pay": cur, "get": "divine"},
                "direction": direction,
                "raw_best_rate": raw,
                "divine_per_unit": divine_per_unit,
                "timestamp": snapshot.timestamp.isoformat() + 'Z'
            })
            continue
        if key_div_pay in historical_cache._history and historical_cache._history[key_div_pay]:
            snapshot = historical_cache._history[key_div_pay][-1]
            direction = "divine->pay"  # divine per X
            raw = snapshot.best_rate
            divine_per_unit = raw
            results.append({
                "currency": cur,
                "source": {"pay": "divine", "get": cur},
                "direction": direction,
                "raw_best_rate": raw,
                "divine_per_unit": divine_per_unit,
                "timestamp": snapshot.timestamp.isoformat() + 'Z'
            })
            continue
        # Unknown value
        results.append({
            "currency": cur,
            "source": None,
            "direction": None,
            "raw_best_rate": None,
            "divine_per_unit": None,
            "timestamp": None
        })

    return {
        "league": league,
        "currencies": results,
        "count": len(results)
    }


# ============================================================================
# Portfolio Snapshot Endpoints
# ============================================================================

_NAME_TO_KEY = {
    'chaos orb': 'chaos',
    'divine orb': 'divine',
    'exalted orb': 'exalted',
    'mirror of kalandra': 'mirror',
    'mirror shard': 'mirror-shard',
    "hinekora's lock": 'hinekoras-lock',
}

def _compute_portfolio_breakdown(account: str, league: str):
    """Fetch stash 'currency' tab and produce quantity map + valuations."""
    # Reuse stash logic
    tab_resp = get_stash_tab('currency')  # will raise if missing
    items = tab_resp.get('items', [])
    quantities = {}
    for it in items:
        key_candidate = (it.get('typeLine') or it.get('name') or '').lower()
        cur_key = _NAME_TO_KEY.get(key_candidate)
        if not cur_key:
            continue
        qty = it.get('stackSize') or 1
        quantities[cur_key] = (quantities.get(cur_key, 0) + qty)

    # Get valuations
    vals = latest_currency_values()
    val_map = {c['currency']: c for c in vals['currencies']}

    breakdown = []
    for cur, qty in sorted(quantities.items()):
        meta = val_map.get(cur)
        divine_per = meta['divine_per_unit'] if meta else None
        total = divine_per * qty if (divine_per is not None) else None
        breakdown.append({
            'currency': cur,
            'quantity': qty,
            'divine_per_unit': divine_per,
            'total_divine': total,
            'source_pair': (meta['source']['pay'] + '->' + meta['source']['get']) if (meta and meta['source']) else None,
        })
    return breakdown

@app.post("/api/portfolio/snapshot")
def create_portfolio_snapshot():
    """Compute and persist a portfolio snapshot, returning breakdown + total."""
    cfg = _load_config()
    if not cfg.account_name:
        raise HTTPException(status_code=400, detail="No account_name configured")
    breakdown = _compute_portfolio_breakdown(cfg.account_name, cfg.league)
    total = sum(b['total_divine'] for b in breakdown if b['total_divine'] is not None)
    from persistence import db
    ts = datetime.utcnow()
    saved = db.save_portfolio_snapshot(ts, total, breakdown)
    return {
        'saved': saved,
        'timestamp': ts.isoformat() + 'Z',
        'total_divines': total,
        'breakdown': breakdown,
        'league': cfg.league,
    }

@app.get("/api/portfolio/history")
def portfolio_history(limit: int = Query(None, ge=1, le=1000)):
    from persistence import db
    rows = db.load_portfolio_history(limit)
    return {
        'count': len(rows),
        'snapshots': rows,
    }