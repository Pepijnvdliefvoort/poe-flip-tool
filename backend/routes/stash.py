from fastapi import APIRouter, Depends, HTTPException
from backend.services.stash_service import get_stash_tab_service
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/stash/{tab_name}")
def get_stash_tab(tab_name: str, api_key: str = Depends(verify_api_key)):
    return get_stash_tab_service(tab_name)
