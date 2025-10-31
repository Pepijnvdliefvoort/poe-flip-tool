from fastapi import APIRouter, Depends, Query
from backend.services.history_service import get_price_history_service
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/history/{have}/{want}")
def get_price_history(have: str, want: str, max_points: int = Query(default=None), api_key: str = Depends(verify_api_key)):
    return get_price_history_service(have, want, max_points)
