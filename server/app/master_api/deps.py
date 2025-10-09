"""Dependencies used by master API routers."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.master_api import security
from app.master_api.models import MasterUser

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/master/auth/login")


async def get_current_master(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> MasterUser:
    try:
        payload = security.decode_master_token(token)
    except Exception:  # pragma: no cover - bubble up uniform error
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    sub = payload.get("sub")
    try:
        master_id = uuid.UUID(str(sub))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc
    if not master_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(MasterUser).where(MasterUser.id == master_id))
    master = result.scalar_one_or_none()
    if not master or not master.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Master not found or inactive")

    return master
