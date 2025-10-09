"""Add 'deleted' and 'blocked' to user_status_t enum

Revision ID: 35a1d7f0_add_deleted_blocked
Revises: 34e296af6fe9
Create Date: 2025-09-02

"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "35a1d7f0_add_deleted_blocked"
down_revision = "34e296af6fe9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: add new values to existing enum
    op.execute("ALTER TYPE user_status_t ADD VALUE IF NOT EXISTS 'blocked';")
    op.execute("ALTER TYPE user_status_t ADD VALUE IF NOT EXISTS 'deleted';")


def downgrade() -> None:
    # Enum value removal is non-trivial in Postgres; keep as no-op.
    # If strictly needed, recreate type and cast. Skipping for simplicity.
    pass

