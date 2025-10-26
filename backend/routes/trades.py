from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body
from typing import Optional
from fastapi.responses import StreamingResponse
from ..models import PairSummary, TradesResponse, TradesPatch
from backend.utils.session import verify_api_key
from backend.services.trade_service import (
    refresh_one_trade_service,
    stream_trades_service,
    refresh_cache_all_service,
    undercut_trade_service
)

router = APIRouter()

@router.post("/trades/refresh_one", response_model=PairSummary)
def refresh_one_trade(index: int = Query(..., ge=0), top_n: int = Query(5, ge=1, le=20), api_key: str = Depends(verify_api_key)):
    return refresh_one_trade_service(index, top_n)

@router.get("/trades/stream")
async def stream_trades(
    request: Request,
    delay_s: float = Query(2, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
    force: bool = Query(False),
    api_key: Optional[str] = Query(None),
    header_api_key: Optional[str] = Depends(verify_api_key)
):
    # Accept API key from query param for EventSource, or from header for normal requests
    key = api_key or header_api_key
    if not key:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")
    return await stream_trades_service(request, delay_s, top_n, force)

@router.post("/trades/refresh_cache")
async def refresh_cache_all(top_n: int = Query(5, ge=1, le=20), api_key: str = Depends(verify_api_key)):
    return await refresh_cache_all_service(top_n)


# --- Undercut endpoint ---

# Accept exact new_rate from frontend
from pydantic import BaseModel

class SetPriceRequest(BaseModel):
    index: int
    new_rate: str  # Accept string to allow fractions like '1/261'

@router.post("/trades/undercut")
def undercut_trade(req: SetPriceRequest, api_key: str = Depends(verify_api_key)):
    """Set the price for a trade pair to the exact value provided and update the forum post."""
    return undercut_trade_service(req.index, new_rate=req.new_rate)
