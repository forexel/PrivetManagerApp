"""Deprecated: users table was already created in 0001_init.
This migration is intentionally a no-op to avoid duplicate table/enum creation.
"""

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401
from sqlalchemy.dialects import postgresql as pg  # noqa: F401

# Alembic identifiers
revision = "0004_users"
down_revision = "0003_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: users table is created in 0001_init
    pass


def downgrade() -> None:
    # No-op
    pass