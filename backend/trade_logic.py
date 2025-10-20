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

load_dotenv()

POESESSID = os.getenv("POESESSID")
CF_CLEARANCE = os.getenv("CF_CLEARANCE")
if not POESESSID or not CF_CLEARANCE:
    raise RuntimeError("Missing POESESSID or CF_CLEARANCE in .env")

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
        resp = requests.post(
            f"{BASE_URL}/{league}",
            headers=HEADERS,
            cookies=COOKIES,
            json=payload,
            timeout=timeout_s,
        )
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
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
        seller = account.get("lastCharacterName") or account.get("name")

        out.append(ListingSummary(
            rate=round(rate, 6),
            have_currency=str(ex.get("currency")),
            have_amount=float(have_amt),
            want_currency=str(it.get("currency")),
            want_amount=float(want_amt),
            stock=it.get("stock"),
            seller=seller,
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


class TradeCache:
    def __init__(self, ttl_seconds: int = 120):
        self.ttl = ttl_seconds
        self._store: Dict[Tuple[str, str, str, int], CacheEntry] = {}

    def get(self, league: str, have: str, want: str, top_n: int) -> Optional[List[ListingSummary]]:
        key = (league, have, want, top_n)
        entry = self._store.get(key)
        if entry and datetime.utcnow() < entry.expires_at:
            return entry.data
        return None

    def set(self, league: str, have: str, want: str, top_n: int, data: List[ListingSummary]):
        key = (league, have, want, top_n)
        self._store[key] = CacheEntry(data=data, expires_at=datetime.utcnow() + timedelta(seconds=self.ttl))


cache = TradeCache(ttl_seconds=120)


def fetch_listings_with_cache(
    *, league: str, have: str, want: str, top_n: int = 5, retries: int = 2, backoff_s: float = 0.8
) -> Optional[List[ListingSummary]]:
    # cache
    cached = cache.get(league, have, want, top_n)
    if cached is not None:
        return cached

    # retry
    for attempt in range(retries + 1):
        raw = _post_exchange(league, have, want)
        if raw:
            listings = summarize_exchange_json(raw, top_n=top_n)
            cache.set(league, have, want, top_n, listings)
            return listings
        if attempt < retries:
            time.sleep(backoff_s * (2 ** attempt))

    return None
