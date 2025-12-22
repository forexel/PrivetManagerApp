"""Dependencies used by manager API routers."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.manager_api import security
from app.manager_api.models import ManagerUser

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/manager/auth/login")


async def get_current_manager(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> ManagerUser:
    try:
        payload = security.decode_manager_token(token)
    except Exception:  # pragma: no cover - bubble up uniform error
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    sub = payload.get("sub")
    try:
        manager_id = uuid.UUID(str(sub))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc
    if not manager_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(ManagerUser).where(ManagerUser.id == manager_id))
    manager = result.scalar_one_or_none()
    if not manager or not manager.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Manager not found or inactive")

    return manager
