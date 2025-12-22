"""Central models package.
Expose SQLAlchemy Base without importing subpackages at runtime to avoid circular imports.
"""
from .base import Base
from typing import TYPE_CHECKING
if TYPE_CHECKING:  # pragma: no cover
    from app.manager_api.models import ManagerUser  # noqa: F401

__all__ = ["Base"]
