from fastapi import APIRouter, Depends
from backend.services.database_service import database_stats_service
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/database/stats")
def database_stats(api_key: str = Depends(verify_api_key)):
    return database_stats_service()
