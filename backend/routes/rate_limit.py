from fastapi import APIRouter, Depends
from backend.services.rate_limit_service import rate_limit_status_service
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/rate_limit")
def rate_limit_status(api_key: str = Depends(verify_api_key)):
    return rate_limit_status_service()
