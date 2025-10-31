from fastapi import Header, HTTPException, status, Query
from typing import Optional

def verify_api_key(
    api_key: Optional[str] = Header(None, alias="X-API-Key"),
    api_key_query: Optional[str] = Query(None, alias="api_key")
):
    """
    FastAPI dependency to verify the session token (API key) from the X-API-Key header or api_key query param.
    Raises HTTPException if the session is invalid or expired.
    """
    key = api_key_query or api_key
    if not key or not verify_session(key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return key
import os
import secrets
import hashlib
from datetime import datetime, timezone
from typing import Dict

AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD_HASH = os.getenv("AUTH_PASSWORD_HASH")
if not AUTH_PASSWORD_HASH:
    plain_password = os.getenv("AUTH_PASSWORD", "changeme")
    AUTH_PASSWORD_HASH = hashlib.sha256(plain_password.encode()).hexdigest()

active_sessions: Dict[str, datetime] = {}
SESSION_DURATION = 24 * 60 * 60  # 24 hours in seconds

def verify_password(username: str, password: str) -> bool:
    if username != AUTH_USERNAME:
        return False
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return password_hash == AUTH_PASSWORD_HASH

def create_session() -> str:
    token = secrets.token_urlsafe(32)
    active_sessions[token] = datetime.now(timezone.utc)
    return token

def verify_session(token: str) -> bool:
    if token not in active_sessions:
        return False
    created_at = active_sessions[token]
    age = (datetime.now(timezone.utc) - created_at).total_seconds()
    if age > SESSION_DURATION:
        del active_sessions[token]
        return False
    return True

def remove_session(token: str) -> bool:
    """Remove a session token from active_sessions. Returns True if removed, False if not found."""
    return active_sessions.pop(token, None) is not None
