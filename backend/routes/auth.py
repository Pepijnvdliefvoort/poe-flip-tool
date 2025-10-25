from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Dict
from backend.utils.session import verify_password, create_session, SESSION_DURATION

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    expires_in: int

router = APIRouter()

@router.post("/auth/login", response_model=LoginResponse)
def login(credentials: LoginRequest):
    if not verify_password(credentials.username, credentials.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_session()
    return LoginResponse(token=token, expires_in=SESSION_DURATION)

@router.post("/auth/logout")
def logout():
    # Implement session removal logic if needed
    return {"status": "logged out"}
