# --- SERVICE: refresh_cache_all_service ---
def refresh_cache_all_service(top_n: int = 5):
    """Refresh cache for all trade pairs and return summaries."""
    from backend.models import PairSummary
    from backend.trade_logic import fetch_listings_with_cache
    from backend.utils.config import load_config
    cfg = load_config()
    results = []
    from backend.trade_logic import historical_cache
    for idx, t in enumerate(cfg.trades):
        listings, was_cached, fetched_at = fetch_listings_with_cache(
            league=cfg.league,
            have=t.pay,
            want=t.get,
            top_n=top_n,
        )
        # Always add a snapshot so sparkline and metrics are in sync
        if listings:
            historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings, top_n=top_n)
        best_rate = listings[0].rate if listings else None
        count_returned = len(listings) if listings else 0
        summary = PairSummary(
            index=idx,
            get=t.get,
            pay=t.pay,
            hot=t.hot,
            status="ok" if listings else "error",
            listings=listings or [],
            best_rate=best_rate,
            median_rate=None,
            count_returned=count_returned,
            trend=None,
            fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else None,
        )
        results.append(summary)
    return results
# --- SERVICE: stream_trades_service ---
import asyncio
from fastapi.responses import StreamingResponse
async def stream_trades_service(request, delay_s: int = 2, top_n: int = 5, force: bool = False):
    """Stream trade summaries for all trade pairs (SSE)."""
    from backend.models import PairSummary
    from backend.trade_logic import fetch_listings_with_cache, fetch_listings_force
    from backend.utils.config import load_config
    cfg = load_config()
    async def event_generator():
        from backend.trade_logic import historical_cache
        for idx, t in enumerate(cfg.trades):
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
            # Always add a snapshot so sparkline and metrics are in sync
            if listings:
                historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings, top_n=top_n)
            best_rate = listings[0].rate if listings else None
            count_returned = len(listings) if listings else 0
            summary = PairSummary(
                index=idx,
                get=t.get,
                pay=t.pay,
                hot=t.hot,
                status="ok" if listings else "error",
                listings=listings or [],
                best_rate=best_rate,
                median_rate=None,
                count_returned=count_returned,
                trend=None,
                fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else None,
            )
            yield f"data: {summary.json()}\n\n"
            if delay_s and not was_cached:
                await asyncio.sleep(delay_s)
    return StreamingResponse(event_generator(), media_type="text/event-stream")
# --- SERVICE: refresh_one_trade_service ---
def refresh_one_trade_service(index: int, top_n: int = 5):
    """Fetch and return a summary for a single trade pair by index."""
    from backend.models import PairSummary
    from backend.trade_logic import fetch_listings_force
    from backend.utils.config import load_config
    cfg = load_config()
    if not (0 <= index < len(cfg.trades)):
        raise Exception("Trade pair not found")
    t = cfg.trades[index]
    from backend.trade_logic import historical_cache
    listings, was_cached, fetched_at = fetch_listings_force(
        league=cfg.league,
        have=t.pay,
        want=t.get,
        top_n=top_n,
    )
    # Always add a snapshot so sparkline and metrics are in sync
    if listings:
        historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings, top_n=top_n)
    best_rate = listings[0].rate if listings else None
    count_returned = len(listings) if listings else 0
    return PairSummary(
        index=index,
        get=t.get,
        pay=t.pay,
        hot=t.hot,
        status="ok" if listings else "error",
        listings=listings or [],
        best_rate=best_rate,
        median_rate=None,
        count_returned=count_returned,
        trend=None,
        fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else None,
    )
import math
import os
import re
import cloudscraper
from dotenv import load_dotenv
from ..rate_limiter import rate_limiter

def get_current_forum_post_content():
    THREAD_ID = int(os.getenv("THREAD_ID", "0"))
    EDIT_URL = f"https://www.pathofexile.com/forum/edit-thread/{THREAD_ID}?history=1"
    POESESSID = os.getenv("POESESSID")
    CF_CLEARANCE = os.getenv("CF_CLEARANCE")
    if not POESESSID or not CF_CLEARANCE or not THREAD_ID:
        raise Exception("Missing POESESSID, CF_CLEARANCE, or THREAD_ID in .env")
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    scraper.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": EDIT_URL,
    })
    cookies = {"POESESSID": POESESSID, "cf_clearance": CF_CLEARANCE}
    scraper.cookies.update(cookies)
    r = scraper.get(EDIT_URL, timeout=30)
    if r.status_code == 403:
        raise Exception("403 on GET. Cloudflare or cookies. Double-check cf_clearance + User-Agent + IP.")
    m = re.search(r'<textarea[^>]*name="content"[^>]*>(.*?)</textarea>', r.text, re.DOTALL | re.IGNORECASE)
    if not m:
        raise Exception("Could not find forum post content textarea.")
    return m.group(1)

def undercut_trade_service(index: int, new_rate: str = None):
    """Set the price for a trade pair to the exact value provided (fraction or decimal) and update the forum post."""
    load_dotenv()
    from backend.models import PairSummary
    from backend.trade_logic import fetch_listings_with_cache
    from backend.utils.config import load_config
    cfg = load_config()
    if not (0 <= index < len(cfg.trades)):
        raise Exception("Trade pair not found")
    t = cfg.trades[index]
    account_name = cfg.account_name
    # Fetch listings (use cache)
    listings, _, _ = fetch_listings_with_cache(
        league=cfg.league,
        have=t.pay,
        want=t.get,
        top_n=10,
    )
    if not listings or not account_name:
        raise Exception("No listings or account name not set")
    # Find my own listing(s)
    def normalize(name):
        return re.sub(r"#\d{3,5}$", "", (name or "")).lower() if name else ''
    my_names = [normalize(n) for n in (account_name.split(',') if account_name else [])]
    # (Removed: check for own listing in listings. Always proceed to update forum post.)
    # Use the exact new_rate provided by the frontend (can be a fraction string like '1/261')
    if new_rate is None:
        raise Exception("new_rate must be provided")
    # Update forum post using cloudscraper
    THREAD_ID = int(os.getenv("THREAD_ID", "0"))
    TITLE = os.getenv("THREAD_TITLE", "shop")
    import html
    forum_content = get_current_forum_post_content()
    forum_content = html.unescape(forum_content)
    # Build the correct ~b/o string
    try:
        s = str(new_rate)
        if '/' in s:
            rate_str = s
        elif re.match(r'^\d+$', s):
            rate_str = f'{s}/1'
        else:
            rate_str = s
    except Exception:
        rate_str = str(new_rate)
    b_o_str = f'~b/o {rate_str} {t.pay}'
    # Build the trade pair line regex (e.g., divine->mirror [item post="26417551" index="2"])
    # Regex: find the exact trade pair, then the closing bracket, then (optionally) ~b/o, and update in-place
    # Only update the first occurrence
    # More robust pattern: match the trade pair, any spaces, the item tag, and anything after (including ~b/o or not), up to end of line
    pair_pattern = re.escape(f'{t.pay}->{t.get}') + r'\s*\[item post="\d+" index="\d+"\]'
    # Match the line, with or without ~b/o, and with optional trailing whitespace or extra text
    line_pattern = rf'({pair_pattern})(.*)$'
    def replace_b_o(match):
        base = match.group(1)
        # Always add or replace ~b/o directly after the bracket, no space
        return f'{base}{b_o_str}'
    new_forum_content, n = re.subn(line_pattern, replace_b_o, forum_content, count=1, flags=re.MULTILINE)
    if n == 0:
        # If not found, do nothing (do not add a new line)
        new_forum_content = forum_content
    content_new = new_forum_content
    POESESSID = os.getenv("POESESSID")
    CF_CLEARANCE = os.getenv("CF_CLEARANCE")
    if not POESESSID or not CF_CLEARANCE or not THREAD_ID:
        raise Exception("Missing POESESSID, CF_CLEARANCE, or THREAD_ID in .env")
    EDIT_URL = f"https://www.pathofexile.com/forum/edit-thread/{THREAD_ID}?history=1"
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    scraper.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": EDIT_URL,
    })
    cookies = {"POESESSID": POESESSID, "cf_clearance": CF_CLEARANCE}
    scraper.cookies.update(cookies)
    import requests
    try:
        r = scraper.get(EDIT_URL, timeout=30)
    except requests.exceptions.SSLError as ssl_err:
        print(f"[ERROR] SSL error while requesting {EDIT_URL}: {ssl_err}")
        return {"status": "ssl_error", "error": str(ssl_err)}
    except Exception as e:
        print(f"[ERROR] Unexpected error while requesting {EDIT_URL}: {e}")
        return {"status": "request_error", "error": str(e)}
    if r.status_code == 403:
        raise Exception("403 on GET. Cloudflare or cookies. Double-check cf_clearance + User-Agent + IP.")
    m = re.search(r'name="hash"\s+value="([a-f0-9\-]+)"', r.text, re.I)
    if not m:
        raise Exception("Could not find CSRF hash in edit form. Are cookies valid / thread owned?")
    hash_token = m.group(1)
    payload = {
        "title": TITLE,
        "content": content_new,
        "notify_owner": "0",
        "hash": hash_token,
        "post_submit": "Submit",
    }
    try:
        r2 = scraper.post(EDIT_URL, data=payload, timeout=30, allow_redirects=False)
    except requests.exceptions.SSLError as ssl_err:
        print(f"[ERROR] SSL error while posting to {EDIT_URL}: {ssl_err}")
        return {"status": "ssl_error", "error": str(ssl_err)}
    except Exception as e:
        print(f"[ERROR] Unexpected error while posting to {EDIT_URL}: {e}")
        return {"status": "request_error", "error": str(e)}
    return {"status": r2.status_code, "new_rate": new_rate, "forum_location": r2.headers.get("Location")}
