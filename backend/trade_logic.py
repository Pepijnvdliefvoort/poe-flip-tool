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
from persistence import db

load_dotenv()

POESESSID = os.getenv("POESESSID")
CF_CLEARANCE = os.getenv("CF_CLEARANCE")
if not POESESSID or not CF_CLEARANCE:
    raise RuntimeError("Missing POESESSID or CF_CLEARANCE in .env")

# Configurable settings from .env
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "900"))  # Default: 15 minutes
HISTORY_RETENTION_HOURS = int(os.getenv("HISTORY_RETENTION_HOURS", "168"))  # Default: 7 days (168 hours)
HISTORY_MAX_POINTS = int(os.getenv("HISTORY_MAX_POINTS", "100"))  # Default: 100 snapshots per pair
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()  # Default: INFO
SPARKLINE_POINTS = int(os.getenv("SPARKLINE_POINTS", "30"))  # Points to return for inline sparkline

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
    fetched_at: datetime


@dataclass
class PriceSnapshot:
    """A single price observation at a point in time"""
    timestamp: datetime
    best_rate: float
    avg_rate: float
    median_rate: float
    listing_count: int


class HistoricalCache:
    """Tracks price history for trend analysis and sparklines"""
    def __init__(self, retention_hours: int = HISTORY_RETENTION_HOURS, max_points_per_pair: int = HISTORY_MAX_POINTS):
        self.retention_hours = retention_hours
        self.max_points = max_points_per_pair
        # Key: (league, have, want) -> List of PriceSnapshot
        self._history: Dict[Tuple[str, str, str], List[PriceSnapshot]] = {}
        self._load_from_db()
    
    def _load_from_db(self):
        """Load historical snapshots from database on startup."""
        try:
            snapshots_dict = db.load_all_snapshots(self.retention_hours)
            for key, snapshot_data_list in snapshots_dict.items():
                # Convert dicts to PriceSnapshot objects
                snapshots = []
                for s in snapshot_data_list:
                    try:
                        # Handle timestamp - might be datetime or string
                        ts = s["timestamp"]
                        if isinstance(ts, str):
                            ts = datetime.fromisoformat(ts)
                        elif not isinstance(ts, datetime):
                            log.warning(f"Skipping snapshot with invalid timestamp type: {type(ts)}")
                            continue
                        
                        snapshots.append(PriceSnapshot(
                            timestamp=ts,
                            best_rate=s["best_rate"],
                            avg_rate=s["avg_rate"],
                            median_rate=s["median_rate"],
                            listing_count=s["listing_count"]
                        ))
                    except Exception as e:
                        log.warning(f"Failed to parse snapshot: {e}")
                        continue
                
                if snapshots:
                    self._history[key] = snapshots
            
            if snapshots_dict:
                total_points = sum(len(v) for v in self._history.values())
                log.info(f"Restored {len(self._history)} pairs with {total_points} total snapshots from database")
            
            # Cleanup old snapshots in database
            db.cleanup_old_snapshots(self.retention_hours)
        except Exception as e:
            log.error(f"Failed to load history from database: {e}")
    
    def add_snapshot(self, league: str, have: str, want: str, listings: List[ListingSummary]):
        """Record current price data as a historical snapshot, avoiding duplicates"""
        if not listings:
            return
        import statistics
        key = (league, have, want)
        best_rate = listings[0].rate
        avg_rate = sum(l.rate for l in listings) / len(listings)
        median_rate = statistics.median([l.rate for l in listings])
        now = datetime.utcnow()
        # Prevent duplicate median snapshot within 1 minute and same value
        last_snap = self._history.get(key, [])[-1] if self._history.get(key) else None
        if last_snap:
            time_diff = (now - last_snap.timestamp).total_seconds()
            median_diff = abs(last_snap.median_rate - median_rate)
            if time_diff < 60 and median_diff < 1e-6:
                log.debug(f"Skipped duplicate snapshot for {have}->{want}: median unchanged ({median_rate:.6f})")
                return
        snapshot = PriceSnapshot(
            timestamp=now,
            best_rate=best_rate,
            avg_rate=avg_rate,
            median_rate=median_rate,
            listing_count=len(listings),
        )
        if key not in self._history:
            self._history[key] = []
        self._history[key].append(snapshot)
        # Clean up old data
        self._cleanup(key)
        # Persist to database
        db.save_snapshot(league, have, want, snapshot.timestamp, best_rate, avg_rate, median_rate, len(listings))
        log.debug(f"Historical snapshot added: {have}->{want} best={best_rate:.2f} avg={avg_rate:.2f} median={median_rate:.2f}")
    
    def _cleanup(self, key: Tuple[str, str, str]):
        """No-op: keep all snapshots forever. Only filter for API output."""
        pass
    
    def get_history(self, league: str, have: str, want: str, max_points: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get price history for a pair, formatted for API response (last 7 days only)"""
        key = (league, have, want)
        all_snapshots = self._history.get(key, [])
        cutoff = datetime.utcnow() - timedelta(days=7)
        snapshots = [s for s in all_snapshots if s.timestamp >= cutoff]
        if max_points and len(snapshots) > max_points:
            step = len(snapshots) / max_points
            indices = [int(i * step) for i in range(max_points)]
            snapshots = [snapshots[i] for i in indices]
        return [
            {
                "timestamp": s.timestamp.isoformat(),
                "median_rate": round(s.median_rate, 6),
                "avg_rate": round(s.avg_rate, 6),
                "listing_count": s.listing_count,
            }
            for s in snapshots
        ]
    
    def get_trend(self, league: str, have: str, want: str) -> Dict[str, Any]:
        """Calculate trend statistics for a pair (last 7 days, median-based)"""
        key = (league, have, want)
        all_snapshots = self._history.get(key, [])
        cutoff = datetime.utcnow() - timedelta(days=7)
        snapshots = [s for s in all_snapshots if s.timestamp >= cutoff]
        if len(snapshots) < 2:
            return {
                "direction": "neutral",
                "change_percent": 0.0,
                "data_points": len(snapshots),
                "sparkline": [s.best_rate for s in snapshots],
                "lowest_median": None,
                "highest_median": None,
            }
        # Use median price at start and end of window
        import statistics
        start_medians = [s.median_rate for s in snapshots[:max(1, len(snapshots)//8)]]
        end_medians = [s.median_rate for s in snapshots[-max(1, len(snapshots)//8):]]
        start_median = statistics.median(start_medians)
        end_median = statistics.median(end_medians)
        # Prevent division by zero/extreme %
        if start_median == 0:
            change_percent = 0.0
        else:
            change_percent = ((end_median - start_median) / start_median) * 100
        direction = "up" if change_percent > 2 else "down" if change_percent < -2 else "neutral"
        # Sparkline
        series = [s.median_rate for s in snapshots]
        if len(series) > SPARKLINE_POINTS:
            step = len(series) / SPARKLINE_POINTS
            indices = [int(i * step) for i in range(SPARKLINE_POINTS)]
            if indices[-1] != len(series) - 1:
                indices[-1] = len(series) - 1
            series = [series[i] for i in indices]
        # Lowest/highest median in window
        lowest_median = min([statistics.median([s.median_rate for s in snapshots[i:i+max(1,len(snapshots)//8)]]) for i in range(0, len(snapshots), max(1,len(snapshots)//8))])
        highest_median = max([statistics.median([s.median_rate for s in snapshots[i:i+max(1,len(snapshots)//8)]]) for i in range(0, len(snapshots), max(1,len(snapshots)//8))])
        return {
            "direction": direction,
            "change_percent": round(change_percent, 2),
            "data_points": len(snapshots),
            "oldest": snapshots[0].timestamp.isoformat(),
            "newest": snapshots[-1].timestamp.isoformat(),
            "sparkline": series,
            "lowest_median": round(lowest_median, 6),
            "highest_median": round(highest_median, 6),
        }
    
    def clear_all(self):
        """Clear all historical data"""
        self._history.clear()
        log.info("Historical cache CLEARED")

    def stats(self) -> Dict[str, Any]:
        """Return aggregate statistics about historical storage"""
        total_pairs = len(self._history)
        total_points = sum(len(v) for v in self._history.values())
        now = datetime.utcnow()
        oldest = None
        newest = None
        for snaps in self._history.values():
            if not snaps:
                continue
            if oldest is None or snaps[0].timestamp < oldest:
                oldest = snaps[0].timestamp
            if newest is None or snaps[-1].timestamp > newest:
                newest = snaps[-1].timestamp
        return {
            "pairs_tracked": total_pairs,
            "total_snapshots": total_points,
            "retention_hours": self.retention_hours,
            "max_points_per_pair": self.max_points,
            "oldest_timestamp": oldest.isoformat() if oldest else None,
            "newest_timestamp": newest.isoformat() if newest else None,
            "age_seconds": (now - oldest).total_seconds() if oldest else 0,
        }


class TradeCache:
    def __init__(self, ttl_seconds: int = 1800):  # 30 minutes default
        self.ttl = ttl_seconds
        self._store: Dict[Tuple[str, str, str], CacheEntry] = {}
        self._load_from_db()

    def _load_from_db(self):
        """Load cache entries from database on startup."""
        try:
            entries = db.load_cache_entries()
            for key, (listings_data, expires_at) in entries.items():
                # Reconstruct ListingSummary objects
                listings = [ListingSummary(**l) for l in listings_data]
                self._store[key] = CacheEntry(data=listings, expires_at=expires_at)
            
            if entries:
                log.info(f"Restored {len(entries)} cache entries from database")
            
            # Cleanup expired entries in database
            db.cleanup_expired_cache()
        except Exception as e:
            log.error(f"Failed to load cache from database: {e}")

    def get(self, league: str, have: str, want: str) -> Optional[Tuple[List[ListingSummary], datetime]]:
        key = (league, have, want)
        entry = self._store.get(key)
        if entry and datetime.utcnow() < entry.expires_at:
            log.info(f"Cache HIT: {have}->{want} (expires in {(entry.expires_at - datetime.utcnow()).total_seconds():.0f}s)")
            return entry.data, entry.fetched_at
        if entry:
            log.info(f"Cache EXPIRED: {have}->{want}")
        return None

    def set(self, league: str, have: str, want: str, data: List[ListingSummary], fetched_at: datetime = None):
        key = (league, have, want)
        expires_at = datetime.utcnow() + timedelta(seconds=self.ttl)
        if fetched_at is None:
            fetched_at = datetime.utcnow()
        self._store[key] = CacheEntry(data=data, expires_at=expires_at, fetched_at=fetched_at)
        log.info(f"Cache SET: {have}->{want} (expires at {expires_at.strftime('%H:%M:%S')}, fetched_at {fetched_at.strftime('%H:%M:%S')})")
        # Persist to database (update this if you persist fetched_at)
        db.save_cache_entry(league, have, want, data, expires_at)

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

    def stats(self) -> Dict[str, Any]:
        now = datetime.utcnow()
        entries = []
        soonest_expiry = None
        for (league, have, want), entry in self._store.items():
            remaining = max(0, (entry.expires_at - now).total_seconds())
            entries.append({
                "league": league,
                "have": have,
                "want": want,
                "expires_at": entry.expires_at.isoformat() + 'Z',  # Append Z to indicate UTC
                # Round to whole seconds per user request
                "seconds_remaining": int(round(remaining)),
                "expired": remaining == 0,
                "listing_count": len(entry.data),
            })
            if soonest_expiry is None or entry.expires_at < soonest_expiry:
                soonest_expiry = entry.expires_at
        # Sort ascending by remaining seconds for UI convenience
        entries.sort(key=lambda e: e["seconds_remaining"])
        return {
            "ttl_seconds": self.ttl,
            "entries": len(self._store),
            "soonest_expiry": (soonest_expiry.isoformat() + 'Z') if soonest_expiry else None,  # Append Z
            "entries_detail": entries,
        }


cache = TradeCache(ttl_seconds=CACHE_TTL_SECONDS)
historical_cache = HistoricalCache(retention_hours=HISTORY_RETENTION_HOURS, max_points_per_pair=HISTORY_MAX_POINTS)


def fetch_listings_with_cache(
    *, league: str, have: str, want: str, top_n: int = 5, retries: int = 2, backoff_s: float = 0.8
) -> Tuple[Optional[List[ListingSummary]], bool, Optional[datetime]]:
    """
    Fetch listings from cache if available, otherwise fetch from API and cache result.
    Returns: (listings, was_cached, fetched_at)
    """
    # Check cache first
    cached = cache.get(league, have, want)
    if cached is not None:
        listings, fetched_at = cached
        return (listings[:top_n], True, fetched_at)

    # Not in cache, fetch from API
    for attempt in range(retries + 1):
        raw = _post_exchange(league, have, want)
        if raw:
            # Fetch more than top_n so we have good cache data
            listings = summarize_exchange_json(raw, top_n=20)  # Always fetch 20 for cache
            fetched_at = datetime.utcnow()
            cache.set(league, have, want, listings, fetched_at=fetched_at)
            # Do not insert snapshot here; handled in API endpoint
            return (listings[:top_n], False, fetched_at)
        if attempt < retries:
            time.sleep(backoff_s * (2 ** attempt))

    return (None, False, None)


def fetch_listings_force(
    *, league: str, have: str, want: str, top_n: int = 5, retries: int = 2, backoff_s: float = 0.8
) -> Tuple[Optional[List[ListingSummary]], bool, Optional[datetime]]:
    """
    Force fetch listings from API, bypassing and updating cache.
    Returns: (listings, was_cached, fetched_at) - was_cached is always False for this function
    """
    # Invalidate cache for this pair
    cache.invalidate(league, have, want)
    # Fetch fresh data from API
    for attempt in range(retries + 1):
        raw = _post_exchange(league, have, want)
        if raw:
            # Fetch more than top_n so we have good cache data
            listings = summarize_exchange_json(raw, top_n=20)  # Always fetch 20 for cache
            fetched_at = datetime.utcnow()
            cache.set(league, have, want, listings, fetched_at=fetched_at)
            # Do not insert snapshot here; handled in API endpoint
            return (listings[:top_n], False, fetched_at)
        if attempt < retries:
            time.sleep(backoff_s * (2 ** attempt))
    return (None, False, None)
