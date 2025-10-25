from fastapi import APIRouter, Depends, Query
from backend.services.cache_service import (
    get_latest_cached_service,
    get_cache_status_service,
    get_expiring_pairs_service,
    cache_summary_service
)
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/cache/latest_cached")
def get_latest_cached(top_n: int = Query(5, ge=1, le=20), api_key: str = Depends(verify_api_key)):
    return get_latest_cached_service(top_n)

@router.get("/cache/status")
def get_cache_status(api_key: str = Depends(verify_api_key)):
    return get_cache_status_service()

@router.get("/cache/expiring")
def get_expiring_pairs(api_key: str = Depends(verify_api_key)):
    return get_expiring_pairs_service()

@router.get("/cache/summary")
def cache_summary(api_key: str = Depends(verify_api_key)):
    return cache_summary_service()
