from __future__ import annotations

from passlib.context import CryptContext

# Support both legacy argon2 hashes and new bcrypt hashes
pwd_context = CryptContext(schemes=["bcrypt", "argon2"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches hashed_password (argon2/bcrypt)."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash password using the primary scheme (bcrypt)."""
    return pwd_context.hash(password)

# --- JWT utils ---
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Union

import jwt

try:
    # Prefer app settings if available
    from app.core.config import settings  # type: ignore
    _SETTINGS_AVAILABLE = True
except Exception:  # pragma: no cover
    settings = None  # type: ignore
    _SETTINGS_AVAILABLE = False

ALGORITHM = "HS256"
SECRET_KEY = (
    os.getenv("SECRET_KEY")
    or os.getenv("JWT_SECRET")
    or os.getenv("JWT_SECRET_KEY")
    or (getattr(settings, "JWT_SECRET", None) if _SETTINGS_AVAILABLE else None)
)
if not SECRET_KEY:
    # Fallback dev key to avoid crashes in local envs; override in prod via env/settings
    SECRET_KEY = "dev_insecure_secret_change_me"

ACCESS_TOKEN_EXPIRE_MINUTES = (
    getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 60) if _SETTINGS_AVAILABLE else 60
)
REFRESH_TOKEN_EXPIRE_DAYS = (
    getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 30) if _SETTINGS_AVAILABLE else 30
)


def _expiry_delta(minutes: int = 60) -> timedelta:
    return timedelta(minutes=minutes)


def create_access_token(subject: Union[str, Dict[str, Any]], expires_minutes: int | None = None) -> str:
    """Create a signed JWT access token.
    `subject` may be a user id (str) or a payload dict; we always include `sub`.
    """
    exp_minutes = expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {"iat": now, "exp": now + _expiry_delta(exp_minutes)}
    if isinstance(subject, dict):
        payload.update(subject)
        payload.setdefault("sub", subject.get("sub"))
    else:
        payload["sub"] = subject
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    # PyJWT>=2 returns str already
    return token  # type: ignore[return-value]


def create_refresh_token(subject: Union[str, Dict[str, Any]], expires_days: int | None = None) -> str:
    days = expires_days or REFRESH_TOKEN_EXPIRE_DAYS
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {"iat": now, "exp": now + timedelta(days=days), "typ": "refresh"}
    if isinstance(subject, dict):
        payload.update(subject)
        payload.setdefault("sub", subject.get("sub"))
    else:
        payload["sub"] = subject
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_jwt_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT (access or refresh). Raises jwt exceptions on failure."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])