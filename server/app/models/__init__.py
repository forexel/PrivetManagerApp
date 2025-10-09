# /Users/d.yudin/PrivetSuperApp/server/app/models/__init__.py
"""Aggregate model imports so Alembic sees them in Base.metadata."""

# Сигнатура метаданных для Alembic. Импортируем только используемые модели.

from .users import User  # noqa: F401
from .devices import Device, DevicePhoto  # noqa: F401
from app.master_api.models import MasterUser  # noqa: F401
from app.models.support import SupportTicket, SupportMessage  # noqa: F401

__all__ = ["User", "Device", "DevicePhoto", "MasterUser", "SupportTicket", "SupportMessage"]
