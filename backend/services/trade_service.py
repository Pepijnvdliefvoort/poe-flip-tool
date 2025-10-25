from datetime import datetime
from fastapi.responses import StreamingResponse
from ..models import PairSummary
from backend.utils.config import load_config
from ..trade_logic import fetch_listings_with_cache, fetch_listings_force
from ..rate_limiter import rate_limiter

# Service for refreshing a single trade

def refresh_one_trade_service(index: int, top_n: int):
    cfg = load_config()
    if not (0 <= index < len(cfg.trades)):
        raise Exception("Trade pair not found")
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
    from backend.trade_logic import historical_cache
    if listings:
        historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings[:top_n])
    trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
    median_rate = None
    if listings:
        rates = [l.rate for l in listings]
        if rates:
            import statistics
            median_rate = statistics.median(rates)
    return PairSummary(
        index=index,
        get=t.get,
        pay=t.pay,
        hot=t.hot,
        status="ok",
        listings=listings,
        best_rate=(listings[0].rate if listings else None),
        median_rate=median_rate,
        count_returned=len(listings),
        trend=trend_data,
        fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
    )

# Service for streaming trades (SSE)
async def stream_trades_service(request, delay_s, top_n, force):
    cfg = load_config()
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
                    from backend.trade_logic import historical_cache
                    if not was_cached and listings:
                        historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings)
                    trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
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
                        fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
                    )
            yield f"data: {{}}\n\n".format(summary.json())
            if delay_s and not was_cached:
                import asyncio
                await asyncio.sleep(delay_s)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Service for refreshing all cache
async def refresh_cache_all_service(top_n):
    cfg = load_config()
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
                from backend.trade_logic import historical_cache
                if not was_cached and listings:
                    historical_cache.add_snapshot(cfg.league, t.pay, t.get, listings[:top_n])
                trend_data = historical_cache.get_trend(cfg.league, t.pay, t.get)
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
                    fetched_at=(fetched_at.isoformat() + 'Z') if fetched_at else datetime.utcnow().isoformat() + 'Z',
                )
        results.append(summary)
    return results
