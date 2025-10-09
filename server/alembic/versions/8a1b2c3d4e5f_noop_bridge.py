"""Bridge for unknown DB revision 8a1b2c3d4e5f

Revision ID: 8a1b2c3d4e5f
Revises: 34e296af6fe9
Create Date: 2025-09-02

This empty migration exists to align a database that has alembic_version
set to 8a1b2c3d4e5f with the current migration graph of the repo.
"""
from __future__ import annotations

# Alembic API
from alembic import op  # noqa: F401

# revision identifiers, used by Alembic.
revision = "8a1b2c3d4e5f"
down_revision = "34e296af6fe9"
branch_labels = None
depends_on = None


def upgrade() -> None:  # pragma: no cover
    # no-op: only to bridge stale DB marker to current tree
    pass


def downgrade() -> None:  # pragma: no cover
    # no-op
    pass

