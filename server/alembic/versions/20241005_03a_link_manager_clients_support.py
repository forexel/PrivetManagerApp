"""manager clients support linkage (no-op, merged into 20241005_02)

Revision ID: 20241005_03a
Revises: 20241005_02_manager_domain.py
Create Date: 2024-10-05
"""

from __future__ import annotations

# revision identifiers, used by Alembic.
revision = "20241005_03a"
down_revision = "20241005_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Support ticket column created in previous revision."""
    pass


def downgrade() -> None:
    """No-op."""
    pass
