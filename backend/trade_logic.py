import os
import time
import json
import math
import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv

from models import ListingSummary
from rate_limiter import rate_limiter

load_dotenv()

POESESSID = os.getenv("POESESSID")
CF_CLEARANCE = os.getenv("CF_CLEARANCE")
if not POESESSID or not CF_CLEARANCE:
    raise RuntimeError("Missing POESESSID or CF_CLEARANCE in .env")

# Configurable settings from .env
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "900"))  # Default: 15 minutes
HISTORY_RETENTION_HOURS = int(os.getenv("HISTORY_RETENTION_HOURS", "24"))  # Default: 24 hours
HISTORY_MAX_POINTS = int(os.getenv("HISTORY_MAX_POINTS", "100"))  # Default: 100 snapshots per pair
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()  # Default: INFO

# Configure logging level
logging.getLogger("poe-backend").setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

BASE_URL = "https://www.pathofexile.com/api/trade/exchange"

HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.8",
    "content-type": "application/json",
    "origin": "https://www.pathofexile.com",
    "referer": "https://www.pathofexile.com/trade/exchange/Standard",
    "sec-ch-ua": '"Chromium";v="141", "Not_A Brand";v="24"',
    "sec-ch-ua-platform": '"Windows"',
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/141.0.0.0 Safari/537.36"
    ),
    "x-requested-with": "XMLHttpRequest",
}
COOKIES = {"POESESSID": POESESSID, "cf_clearance": CF_CLEARANCE}

log = logging.getLogger("poe-backend")


# --------------------------
# Fetch + summarize
# --------------------------
def _post_exchange(league: str, have: str, want: str, timeout_s: int = 20) -> Optional[Dict[str, Any]]:
    payload = {
        "query": {
            "status": {"option": "online"},
            "have": [have],
            "want": [want],
        },
        "sort": {"have": "asc"},
    }
    try:
        # Block if currently rate limited or soft-throttled
        log.debug(f"Fetching {have}->{want} (throttled={rate_limiter.throttled}, remaining={rate_limiter.throttled_remaining:.1f}s)")
        rate_limiter.wait_before_request()
        
        resp = requests.post(
            f"{BASE_URL}/{league}",
            headers=HEADERS,
            cookies=COOKIES,
            json=payload,
            timeout=timeout_s,
        )
        
        # Update limiter state using response headers
        rate_limiter.on_response(resp.headers)
        
        if resp.status_code == 429:
            log.error(f"❌ 429 Too Many Requests for {have}->{want}. Headers: {dict(resp.headers)}")
            return None
        
        if resp.status_code != 200:
            log.warning(f"Non-200 status {resp.status_code} for {have}->{want}")
            return None
            
        return resp.json()
    except requests.exceptions.Timeout:
        log.warning(f"Timeout fetching {have}->{want}")
        return None
    except Exception as e:
        log.error(f"Error fetching {have}->{want}: {e}")
        return None


def summarize_exchange_json(data: Dict[str, Any], top_n: int = 5) -> List[ListingSummary]:
    out: List[ListingSummary] = []
    result_obj = data.get("result")
    if not result_obj:
        return out

    iterable = result_obj.items() if isinstance(result_obj, dict) else enumerate(result_obj)
    for _, node in iterable:
        listing = (node or {}).get("listing", {})
        offers = listing.get("offers") or []
        if not offers:
            continue
        offer = offers[0]
        ex = offer.get("exchange", {})  # what seller wants (your pay)
        it = offer.get("item", {})      # what seller gives (your get)

        have_amt = ex.get("amount")
        want_amt = it.get("amount") or 1
        if not isinstance(have_amt, (int, float)) or not isinstance(want_amt, (int, float)):
            continue
        try:
            rate = float(have_amt) / float(want_amt)
        except ZeroDivisionError:
            continue

        account = listing.get("account") or {}
        account_name = account.get("name")
        
        # Build whisper message
        whisper_template = listing.get("whisper", "")
        exchange_whisper = ex.get("whisper", "")
        item_whisper = it.get("whisper", "")
        if whisper_template and exchange_whisper and item_whisper:
            # Replace {0} with item and {1} with exchange
            whisper = whisper_template.replace("{0}", item_whisper.replace("{0}", str(int(want_amt)))).replace("{1}", exchange_whisper.replace("{0}", str(int(have_amt))))
        else:
            whisper = None

        out.append(ListingSummary(
            rate=round(rate, 6),
            have_currency=str(ex.get("currency")),
            have_amount=float(have_amt),
            want_currency=str(it.get("currency")),
            want_amount=float(want_amt),
            stock=it.get("stock"),
            account_name=account_name,
            whisper=whisper,
            indexed=listing.get("indexed"),
        ))

    out.sort(key=lambda e: (e.rate if e.rate is not None else math.inf))
    return out[:max(1, int(top_n))]


# --------------------------
# Retry + TTL cache
# --------------------------
@dataclass
class CacheEntry:
    data: List[ListingSummary]
    expires_at: datetime


@dataclass
class PriceSnapshot:
    """A single price observation at a point in time"""
    timestamp: datetime
    best_rate: float
    avg_rate: float
    listing_count: int


class HistoricalCache:
    """Tracks price history for trend analysis and sparklines"""
    def __init__(self, retention_hours: int = HISTORY_RETENTION_HOURS, max_points_per_pair: int = HISTORY_MAX_POINTS):
        self.retention_hours = retention_hours
        self.max_points = max_points_per_pair
        # Key: (league, have, want) -> List of PriceSnapshot
        self._history: Dict[Tuple[str, str, str], List[PriceSnapshot]] = {}
    
    def add_snapshot(self, league: str, have: str, want: str, listings: List[ListingSummary]):
        """Record current price data as a historical snapshot"""
        if not listings:
            return
        
        key = (league, have, want)
        best_rate = listings[0].rate
        avg_rate = sum(l.rate for l in listings) / len(listings)
        
        snapshot = PriceSnapshot(
            timestamp=datetime.utcnow(),
            best_rate=best_rate,
            avg_rate=avg_rate,
            listing_count=len(listings),
        )
        
        if key not in self._history:
            self._history[key] = []
        
        self._history[key].append(snapshot)
        
        # Clean up old data
        self._cleanup(key)
        
        log.debug(f"Historical snapshot added: {have}->{want} best={best_rate:.2f} avg={avg_rate:.2f}")
    
    def _cleanup(self, key: Tuple[str, str, str]):
        """Remove snapshots older than retention period and limit to max points"""
        if key not in self._history:
            return
        
        cutoff = datetime.utcnow() - timedelta(hours=self.retention_hours)
        snapshots = self._history[key]
        
        # Remove old entries
        snapshots = [s for s in snapshots if s.timestamp > cutoff]
        
        # Limit to max points (keep most recent)
        if len(snapshots) > self.max_points:
            snapshots = snapshots[-self.max_points:]
        
        self._history[key] = snapshots
    
    def get_history(self, league: str, have: str, want: str, max_points: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get price history for a pair, formatted for API response"""
        key = (league, have, want)
        snapshots = self._history.get(key, [])
        
        # Clean up before returning
        if snapshots:
            self._cleanup(key)
            snapshots = self._history.get(key, [])
        
        # Limit points if requested
        if max_points and len(snapshots) > max_points:
            # Sample evenly across the dataset
            step = len(snapshots) / max_points
            indices = [int(i * step) for i in range(max_points)]
            snapshots = [snapshots[i] for i in indices]
        
        return [
            {
                "timestamp": s.timestamp.isoformat(),
                "best_rate": round(s.best_rate, 6),
                "avg_rate": round(s.avg_rate, 6),
                "listing_count": s.listing_count,
            }
            for s in snapshots
        ]
    
    def get_trend(self, league: str, have: str, want: str) -> Dict[str, Any]:
        """Calculate trend statistics for a pair"""
        key = (league, have, want)
        snapshots = self._history.get(key, [])
        
        if len(snapshots) < 2:
            return {
                "direction": "neutral",
                "change_percent": 0.0,
                "data_points": len(snapshots),
            }
        
        # Compare recent average to older average
        recent_count = max(1, len(snapshots) // 4)  # Last 25% of data
        recent_avg = sum(s.best_rate for s in snapshots[-recent_count:]) / recent_count
        older_avg = sum(s.best_rate for s in snapshots[:recent_count]) / recent_count
        
        change_percent = ((recent_avg - older_avg) / older_avg) * 100 if older_avg > 0 else 0.0
        
        if change_percent > 2:
            direction = "up"
        elif change_percent < -2:
            direction = "down"
        else:
            direction = "neutral"
        
        return {
            "direction": direction,
            "change_percent": round(change_percent, 2),
            "data_points": len(snapshots),
            "oldest": snapshots[0].timestamp.isoformat(),
            "newest": snapshots[-1].timestamp.isoformat(),
        }
    
    def clear_all(self):
        """Clear all historical data"""
        self._history.clear()
        log.info("Historical cache CLEARED")


class TradeCache:
    def __init__(self, ttl_seconds: int = 1800):  # 30 minutes default
        self.ttl = ttl_seconds
        self._store: Dict[Tuple[str, str, str], CacheEntry] = {}

    def get(self, league: str, have: str, want: str) -> Optional[List[ListingSummary]]:
        key = (league, have, want)
        entry = self._store.get(key)
        if entry and datetime.utcnow() < entry.expires_at:
            log.info(f"Cache HIT: {have}->{want} (expires in {(entry.expires_at - datetime.utcnow()).total_seconds():.0f}s)")
            return entry.data
        if entry:
            log.info(f"Cache EXPIRED: {have}->{want}")
        return None

    def set(self, league: str, have: str, want: str, data: List[ListingSummary]):
        key = (league, have, want)
        expires_at = datetime.utcnow() + timedelta(seconds=self.ttl)
        self._store[key] = CacheEntry(data=data, expires_at=expires_at)
        log.info(f"Cache SET: {have}->{want} (expires at {expires_at.strftime('%H:%M:%S')})")

    def invalidate(self, league: str, have: str, want: str):
        """Remove a specific entry from cache"""
        key = (league, have, want)
        if key in self._store:
            del self._store[key]
            log.info(f"Cache INVALIDATED: {have}->{want}")

    def clear_all(self):
        """Clear entire cache"""
        self._store.clear()
        log.info("Cache CLEARED")


cache = TradeCache(ttl_seconds=CACHE_TTL_SECONDS)
historical_cache = HistoricalCache(retention_hours=HISTORY_RETENTION_HOURS, max_points_per_pair=HISTORY_MAX_POINTS)


def fetch_listings_with_cache(
    *, league: str, have: str, want: str, top_n: int = 5, retries: int = 2, backoff_s: float = 0.8
) -> Tuple[Optional[List[ListingSummary]], bool]:
    """
    Fetch listings from cache if available, otherwise fetch from API and cache result.
    Returns: (listings, was_cached)
    """
    # Check cache first
    cached = cache.get(league, have, want)
    if cached is not None:
        # Return cached data, but slice to top_n
        return (cached[:top_n], True)

    # Not in cache, fetch from API
    for attempt in range(retries + 1):
        raw = _post_exchange(league, have, want)
        if raw:
            # Fetch more than top_n so we have good cache data
            listings = summarize_exchange_json(raw, top_n=20)  # Always fetch 20 for cache
            cache.set(league, have, want, listings)
            
            # Add to historical tracking
            historical_cache.add_snapshot(league, have, want, listings)
            
            return (listings[:top_n], False)
        if attempt < retries:
            time.sleep(backoff_s * (2 ** attempt))

    return (None, False)


def fetch_listings_force(
    *, league: str, have: str, want: str, top_n: int = 5, retries: int = 2, backoff_s: float = 0.8
) -> Tuple[Optional[List[ListingSummary]], bool]:
    """
    Force fetch listings from API, bypassing and updating cache.
    Returns: (listings, was_cached) - was_cached is always False for this function
    """
    # Invalidate cache for this pair
    cache.invalidate(league, have, want)
    
    # Fetch fresh data from API
    for attempt in range(retries + 1):
        raw = _post_exchange(league, have, want)
        if raw:
            # Fetch more than top_n so we have good cache data
            listings = summarize_exchange_json(raw, top_n=20)  # Always fetch 20 for cache
            cache.set(league, have, want, listings)
            
            # Add to historical tracking
            historical_cache.add_snapshot(league, have, want, listings)
            
            return (listings[:top_n], False)
        if attempt < retries:
            time.sleep(backoff_s * (2 ** attempt))
    
    return (None, False)
