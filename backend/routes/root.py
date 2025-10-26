
from fastapi import APIRouter, Depends
import os
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/")
def root():
    return {"status": "ok", "message": "PoE Trade Backend running"}


# New endpoint to expose forum thread ID
@router.get("/forum-thread-id")
def forum_thread_id(api_key: str = Depends(verify_api_key)):
    thread_id = os.getenv("THREAD_ID")
    if not thread_id:
        return {"thread_id": None}
    return {"thread_id": thread_id}
