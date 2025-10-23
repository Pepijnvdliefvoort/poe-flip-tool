from datetime import datetime, timezone
import json
import time
import logging
import os
from pathlib import Path
from typing import List, Dict
import requests
import secrets
import hashlib
import asyncio  # Added for background scheduling

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Request, Body, Security, Depends
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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
# Security & Authentication
# ============================================================================

# Get username and password from environment
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD_HASH = os.getenv("AUTH_PASSWORD_HASH")

# If no password hash is set, create one from plain password (for dev)
if not AUTH_PASSWORD_HASH:
    plain_password = os.getenv("AUTH_PASSWORD", "changeme")
    AUTH_PASSWORD_HASH = hashlib.sha256(plain_password.encode()).hexdigest()
    log.warning(f"No AUTH_PASSWORD_HASH set. Using password: {plain_password}")
    log.warning("Set AUTH_PASSWORD_HASH in production! Generate with: echo -n 'yourpassword' | sha256sum")

# Session storage (in-memory for simplicity)
active_sessions: Dict[str, datetime] = {}
SESSION_DURATION = 24 * 60 * 60  # 24 hours in seconds

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    expires_in: int

def verify_password(username: str, password: str) -> bool:
    """Verify username and password."""
    if username != AUTH_USERNAME:
        return False
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return password_hash == AUTH_PASSWORD_HASH

def create_session() -> str:
    """Create a new session token."""
    token = secrets.token_urlsafe(32)
    active_sessions[token] = datetime.now(timezone.utc)
    return token

def verify_session(token: str) -> bool:
    """Verify a session token is valid and not expired."""
    if token not in active_sessions:
        return False
    
    created_at = active_sessions[token]
    age = (datetime.now(timezone.utc) - created_at).total_seconds()
    
    if age > SESSION_DURATION:
        # Session expired, remove it
        del active_sessions[token]
        return False
    
    return True

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(
    request: Request,
    api_key_header: str = Security(api_key_header),
    api_key_query: str = Query(None, alias="api_key")
):
    """Verify the session token from request headers or query parameters (for EventSource)."""
    # Check header first, then query parameter (for EventSource compatibility)
    token = api_key_header or api_key_query
    
    if not token or not verify_session(token):
        log.warning(f"Unauthorized access attempt with token: {token[:8] if token else 'None'}...")
        raise HTTPException(
            status_code=403,
            detail="Invalid or missing session token"
        )
    return token

# ============================================================================
# Configuration
# ============================================================================

CONFIG_PATH = Path(__file__).parent / "config.json"

# Cache check interval (used by frontend to know how often to poll)
CACHE_CHECK_INTERVAL_SECONDS = int(os.getenv("CACHE_CHECK_INTERVAL_SECONDS", "30"))  # default 30s

# ============================================================================
# Background Portfolio Snapshot Scheduler
# ============================================================================

ENABLE_PORTFOLIO_SCHEDULER = os.getenv("ENABLE_PORTFOLIO_SCHEDULER", "1") == "1"
PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS = int(os.getenv("PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS", "900"))  # default 15m

# Track last run metadata for observability endpoint
_portfolio_scheduler_state = {
    "enabled": ENABLE_PORTFOLIO_SCHEDULER,
    "interval_seconds": PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS,
    "last_success": None,          # ISO timestamp of last successful snapshot
    "last_error": None,            # Last error message (if any)
    "last_total_divines": None,    # Last computed total
    "runs": 0,                     # Number of attempts (success or fail)
}

async def _portfolio_snapshot_loop():
    """Background loop that records portfolio snapshots every interval.

    Runs independently of any active frontend tab so progress is tracked even when UI is closed.
    Skips if no account_name configured or if snapshot logic raises an exception.
    """
    # Small initial delay to allow app startup to settle
    await asyncio.sleep(5)
    log.info("Portfolio snapshot scheduler loop started")
    while True:
        started = datetime.utcnow()
        _portfolio_scheduler_state["runs"] += 1
        try:
            cfg = _load_config()
            if not cfg.account_name:
                log.debug("Portfolio scheduler: skipping (no account_name configured)")
            else:
                # Reuse existing helper for breakdown
                breakdown = _compute_portfolio_breakdown(cfg.account_name, cfg.league)
                total = sum(b['total_divine'] for b in breakdown if b.get('total_divine') is not None)
                from persistence import db  # local import to avoid circulars at module import time
                saved = db.save_portfolio_snapshot(started, total, breakdown)
                if saved:
                    _portfolio_scheduler_state["last_success"] = started.isoformat() + 'Z'
                    _portfolio_scheduler_state["last_total_divines"] = round(total, 6)
                    _portfolio_scheduler_state["last_error"] = None
                    log.info(f"[PortfolioScheduler] Snapshot saved total={total:.3f} at {started.isoformat()}Z")
                else:
                    msg = "DB persist returned False"
                    _portfolio_scheduler_state["last_error"] = msg
                    log.error(f"[PortfolioScheduler] Failed to persist snapshot: {msg}")
        except Exception as e:  # broad catch to prevent loop exit
            err = str(e)
            _portfolio_scheduler_state["last_error"] = err
            log.error(f"[PortfolioScheduler] Error during snapshot: {err}")
        # Sleep remaining interval (guard minimum 5s to avoid hammering on negative intervals)
        elapsed = (datetime.utcnow() - started).total_seconds()
        remaining = max(5, PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS - elapsed)
        await asyncio.sleep(remaining)

@app.on_event("startup")
async def _start_portfolio_scheduler():
    if ENABLE_PORTFOLIO_SCHEDULER:
        try:
            asyncio.create_task(_portfolio_snapshot_loop())
            log.info(f"Portfolio snapshot scheduler enabled (interval={PORTFOLIO_SNAPSHOT_INTERVAL_SECONDS}s)")
        except Exception as e:
            log.error(f"Failed to start portfolio snapshot scheduler: {e}")
    else:
        log.info("Portfolio snapshot scheduler disabled via ENABLE_PORTFOLIO_SCHEDULER=0")

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


def _calculate_profit_margins(pairs: List[PairSummary]) -> None:
    """
    Calculate profit margins for linked trade pairs in-place.
    
    For each pair, finds its reverse pair (e.g., divine->chaos has chaos->divine as reverse).
    Calculates the profit margin if both pairs have valid best_rate values.
    
    Example: If buying 1 divine for 280 chaos (divine->chaos rate=280) and
             selling 250 chaos for 1 divine (chaos->divine rate=1/250=0.004),
             profit = 280 - 250 = 30 chaos per cycle (10.71% margin).
    """
    for i, pair_a in enumerate(pairs):
        # Skip if already calculated or no valid rate
        if pair_a.linked_pair_index is not None or pair_a.best_rate is None:
            continue
        
        # Find the reverse pair
        for j, pair_b in enumerate(pairs):
            if i == j:
                continue
            
            # Check if this is the reverse pair (get/pay swapped)
            if pair_a.get == pair_b.pay and pair_a.pay == pair_b.get:
                if pair_b.best_rate is not None and pair_b.best_rate > 0:
                    # Link them together
                    pair_a.linked_pair_index = j
                    pair_b.linked_pair_index = i
                    
                    # Calculate profit margin
                    # pair_a: pay X to get Y (rate = Y/X)
                    # pair_b: pay Y to get X (rate = X/Y)
                    # If we execute both: spend X to get Y, then spend Y to get X back
                    # We should end up with more X than we started with
                    
                    # Amount of pair_a.get currency we receive per 1 pair_a.pay
                    receive_per_cycle = pair_a.best_rate
                    
                    # Amount of pair_a.pay currency we need to get back 1 pair_a.pay
                    # pair_b.best_rate is pair_a.pay per pair_a.get, so we need 1/pair_b.best_rate of pair_a.get
                    spend_to_get_back = 1.0 / pair_b.best_rate if pair_b.best_rate > 0 else 0
                    
                    # Raw profit in pair_a.get currency per 1 pair_a.pay spent
                    raw_profit = receive_per_cycle - spend_to_get_back
                    
                    # Percentage profit margin
                    profit_pct = (raw_profit / spend_to_get_back * 100) if spend_to_get_back > 0 else 0
                    
                    pair_a.profit_margin_raw = round(raw_profit, 4)
                    pair_a.profit_margin_pct = round(profit_pct, 2)
                    pair_b.profit_margin_raw = round(raw_profit, 4)
                    pair_b.profit_margin_pct = round(profit_pct, 2)
                
                break

# ============================================================================
# Route Handlers
# ============================================================================

@app.get("/")
def root():
    """Health check endpoint"""
    return {"status": "ok", "message": "PoE Trade Backend running"}


@app.post("/api/auth/login", response_model=LoginResponse)
def login(credentials: LoginRequest):
    """Authenticate with username and password, returns session token"""
    if not verify_password(credentials.username, credentials.password):
        log.warning(f"Failed login attempt for user: {credentials.username}")
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )
    
    token = create_session()
    log.info(f"Successful login for user: {credentials.username}")
    return LoginResponse(token=token, expires_in=SESSION_DURATION)


@app.post("/api/auth/logout")
def logout(api_key: str = Depends(verify_api_key)):
    """Logout and invalidate session token"""
    if api_key in active_sessions:
        del active_sessions[api_key]
    return {"status": "ok", "message": "Logged out"}


@app.get("/api/config", response_model=ConfigData)
def get_config(api_key: str = Depends(verify_api_key)):
    """Get current configuration"""
    return _load_config()


@app.put("/api/config", response_model=ConfigData)
def put_config(cfg: ConfigData, api_key: str = Depends(verify_api_key)):
    """Replace entire configuration"""
    _save_config(cfg)
    return cfg


@app.patch("/api/config/league", response_model=ConfigData)
def patch_league(league: str, api_key: str = Depends(verify_api_key)):
    """Update only the league setting"""
    cfg = _load_config()
    cfg.league = league
    _save_config(cfg)
    return cfg


@app.patch("/api/config/account_name", response_model=ConfigData)
def patch_account_name(account_name: str = Body(..., embed=True), api_key: str = Depends(verify_api_key)):
    """Update only the account_name setting used for highlighting listings"""
    cfg = _load_config()
    cfg.account_name = account_name.strip() or None
    _save_config(cfg)
    return cfg

@app.patch("/api/config/trades", response_model=ConfigData)
def patch_trades(patch: TradesPatch = Body(...), api_key: str = Depends(verify_api_key)):
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
    api_key: str = Depends(verify_api_key)
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
    
    listings, was_cached, fetched_at = fetch_listings_force(
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
            fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
        )
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
        fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
    )


@app.get("/api/trades/stream")
async def stream_trades(
    request: Request,
    delay_s: float = Query(2, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
    force: bool = Query(False),
    api_key: str = Depends(verify_api_key)
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
            fetched_at = None
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
                    listings, was_cached, fetched_at = fetch_listings_force(
                        league=cfg.league,
                        have=t.pay,
                        want=t.get,
                        top_n=top_n,
                    )
                else:
                    listings, was_cached, fetched_at = fetch_listings_with_cache(
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
                        fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
                    )
                else:
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
                        fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
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


@app.post("/api/trades/refresh_cache")
async def refresh_cache_all(
    top_n: int = Query(5, ge=1, le=20),
    api_key: str = Depends(verify_api_key)
):
    """
    Refresh cache for all configured trade pairs (non-forced, uses cache TTL).
    Returns the current cached state after refresh attempts.
    Used by global 15-minute polling timer.
    """
    cfg = _load_config()
    results = []
    
    for idx, t in enumerate(cfg.trades):
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
            # Use cache-aware fetch (will only hit API if cache expired)
            listings, was_cached, fetched_at = fetch_listings_with_cache(
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
                    fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
                )
            else:
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
                    fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
                )
        results.append(summary)
    
    # Calculate profit margins
    _calculate_profit_margins(results)
    
    return TradesResponse(
        league=cfg.league,
        pairs=len(results),
        results=results
    )


@app.get("/api/trades/latest_cached")
def get_latest_cached(
    top_n: int = Query(5, ge=1, le=20),
    api_key: str = Depends(verify_api_key)
):
    """
    Retrieve latest cached data for all configured pairs without triggering any API calls.
    Returns cached data even if expired. Used by 60s trade page refresh timer.
    """
    from trade_logic import cache, historical_cache
    from datetime import datetime
    
    cfg = _load_config()
    results = []
    now = datetime.utcnow()
    
    for idx, t in enumerate(cfg.trades):
        key = (cfg.league, t.pay, t.get)
        entry = cache._store.get(key)
        
        if entry and entry.data:
            trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
            listings = entry.data[:top_n]
            
            # Calculate cache age for logging
            seconds_remaining = (entry.expires_at - now).total_seconds()
            cache_age_seconds = (now - entry.fetched_at).total_seconds() if entry.fetched_at else 0
            
            log.debug(
                f"[latest_cached] {t.pay}->{t.get}: "
                f"fetched={entry.fetched_at.isoformat() if entry.fetched_at else 'unknown'} "
                f"age={cache_age_seconds:.1f}s remaining={seconds_remaining:.1f}s"
            )
            
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
                fetched_at=(entry.fetched_at.isoformat() + 'Z') if entry.fetched_at else None,
            )
        else:
            # No cache entry - return empty result
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
    _calculate_profit_margins(results)
    
    return TradesResponse(
        league=cfg.league,
        pairs=len(results),
        results=results
    )


@app.get("/api/history/{have}/{want}")
def get_price_history(
    have: str,
    want: str,
    max_points: int = Query(default=None, description="Limit number of datapoints returned"),
    api_key: str = Depends(verify_api_key)
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
def get_cache_status(api_key: str = Depends(verify_api_key)):
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


@app.get("/api/cache/expiring")
def get_expiring_pairs(
    api_key: str = Depends(verify_api_key)
):
    """
    Get list of pair indices that are expired (seconds_remaining <= 0).
    Used by the check interval timer to determine which pairs need refreshing.
    """
    from trade_logic import cache
    from datetime import datetime
    
    cfg = _load_config()
    expired = []
    
    now = datetime.utcnow()
    
    for idx, trade in enumerate(cfg.trades):
        key = (cfg.league, trade.pay, trade.get)
        entry = cache._store.get(key)
        
        if entry:
            seconds_remaining = (entry.expires_at - now).total_seconds()
            # Only include if expired
            if seconds_remaining <= 0:
                expired.append({
                    "index": idx,
                    "have": trade.pay,
                    "want": trade.get,
                    "seconds_remaining": 0,
                    "expired": True
                })
        else:
            # No cache entry means it needs refreshing
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


@app.get("/api/rate_limit")
def rate_limit_status(api_key: str = Depends(verify_api_key)):
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
def cache_summary(api_key: str = Depends(verify_api_key)):
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
def database_stats(api_key: str = Depends(verify_api_key)):
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
def get_stash_tab(tab_name: str, api_key: str = Depends(verify_api_key)):
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
def latest_currency_values(api_key: str = Depends(verify_api_key)):
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
                "timestamp": datetime.now().isoformat()
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
                "timestamp": snapshot.timestamp.isoformat()
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
                "timestamp": snapshot.timestamp.isoformat()
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
def create_portfolio_snapshot(api_key: str = Depends(verify_api_key)):
    """Compute and persist a portfolio snapshot, returning breakdown + total."""
    cfg = _load_config()
    if not cfg.account_name:
        raise HTTPException(status_code=400, detail="No account_name configured")
    breakdown = _compute_portfolio_breakdown(cfg.account_name, cfg.league)
    total = sum(b['total_divine'] for b in breakdown if b['total_divine'] is not None)
    from persistence import db
    ts = datetime.now()
    saved = db.save_portfolio_snapshot(ts, total, breakdown)
    return {
        'saved': saved,
        'timestamp': ts.isoformat(),
        'total_divines': total,
        'breakdown': breakdown,
        'league': cfg.league,
    }

@app.get("/api/portfolio/history")
def portfolio_history(limit: int = Query(None, ge=1, le=1000), api_key: str = Depends(verify_api_key)):
    from persistence import db
    rows = db.load_portfolio_history(limit)
    return {
        'count': len(rows),
        'snapshots': rows,
    }


@app.get("/api/portfolio/scheduler_status")
def portfolio_scheduler_status(api_key: str = Depends(verify_api_key)):
    """Return runtime status for the background portfolio snapshot scheduler."""
    # Provide a copy so internal dict can't be mutated from outside
    return dict(_portfolio_scheduler_state)