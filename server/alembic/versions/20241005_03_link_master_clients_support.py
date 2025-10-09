"""link master clients to support tickets

Revision ID: 20241005_03
Revises: 20241005_02_master_domain.py
Create Date: 2024-10-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20241005_03"
down_revision = "20241005_02_master_domain.py"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "master_clients",
        sa.Column("support_ticket_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_master_clients_support_ticket",
        "master_clients",
        "support_tickets",
        ["support_ticket_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_master_clients_support_ticket", "master_clients", type_="foreignkey")
    op.drop_column("master_clients", "support_ticket_id")
