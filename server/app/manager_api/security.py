"""Security helpers dedicated to the manager contour."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def _get_secret() -> str:
    secret = settings.MANAGER_JWT_SECRET
    if not secret:
        raise RuntimeError("MANAGER_JWT_SECRET is not configured")
    return secret


def create_manager_access_token(subject: str, extra_claims: Dict[str, Any] | None = None) -> tuple[str, int]:
    """Return a signed JWT access token and its TTL in seconds."""
    expires_minutes = settings.MANAGER_ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=expires_minutes)
    payload: Dict[str, Any] = {"sub": subject, "iat": now, "exp": expires_at, "typ": "access"}
    if extra_claims:
        payload.update(extra_claims)
    token = jwt.encode(payload, _get_secret(), algorithm=ALGORITHM)
    return token, int((expires_at - now).total_seconds())


def decode_manager_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, _get_secret(), algorithms=[ALGORITHM])
