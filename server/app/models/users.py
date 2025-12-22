from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict
from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# ---- User Schemas ----

class UserBase(BaseModel):
    phone: str = Field(..., examples=["+79991234567"])              # телефон обязателен
    email: Optional[EmailStr] = None                                # email опционален
    name: Optional[str] = Field(default=None, examples=["Danila"])  # имя можно не передавать

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, examples=["secret123"])  # как ты просил — минимум 8


class UserRead(UserBase):
    id: uuid.UUID
    status: Optional[str] = Field(default=None, examples=["ACTIVE"])  # keep as str to avoid enum coupling
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    BLOCKED = "blocked"
    DELETED = "deleted"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String)
    address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(
        SAEnum(
            'active', 'blocked', 'deleted', 'gost', 'ghost',
            name="user_status_t",
            native_enum=True,
            create_type=False,
            validate_strings=False,
        ),
        nullable=False,
        server_default='active',
        default='active',
    )
    has_subscription: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
