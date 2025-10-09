"""Merge heads: ticket status default and user_status enum

Revision ID: 35b0_merge_heads
Revises: 0b445c495839, 35a1d7f0_add_deleted_blocked
Create Date: 2025-09-02

"""
from __future__ import annotations

# This is an Alembic merge migration.
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision = "35b0_merge_heads"
down_revision = ("0b445c495839", "35a1d7f0_add_deleted_blocked", "8a1b2c3d4e5f")
branch_labels = None
depends_on = None


def upgrade() -> None:  # pragma: no cover
    # no-op merge
    pass


def downgrade() -> None:  # pragma: no cover
    # no-op merge
    pass
