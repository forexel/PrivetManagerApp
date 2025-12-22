"""Merge alembic heads

Revision ID: 20251022_merge_heads
Revises: 20251022_fix_user_invoices_client_fk, 20241005_03a
Create Date: 2025-10-22
"""

from __future__ import annotations

revision = "20251022_merge_heads"
down_revision = ("20251022_fix_user_invoices_client_fk", "20241005_03a")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
