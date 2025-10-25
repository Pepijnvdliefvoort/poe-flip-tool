from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def root():
    return {"status": "ok", "message": "PoE Trade Backend running"}
