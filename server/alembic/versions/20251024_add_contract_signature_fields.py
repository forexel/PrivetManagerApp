"""Add contract signature audit fields

Revision ID: 20251024_add_contract_signature_fields
Revises: 20251022_merge_heads
Create Date: 2025-10-24
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20251024_add_contract_signature_fields"
down_revision = "20251022_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_contracts", sa.Column("pep_agreed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_contracts", sa.Column("signature_hash", sa.String(length=64), nullable=True))
    op.add_column("user_contracts", sa.Column("signature_hmac", sa.String(length=128), nullable=True))
    op.add_column("user_contracts", sa.Column("signed_ip", sa.String(length=64), nullable=True))
    op.add_column("user_contracts", sa.Column("signed_user_agent", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("user_contracts", "signed_user_agent")
    op.drop_column("user_contracts", "signed_ip")
    op.drop_column("user_contracts", "signature_hmac")
    op.drop_column("user_contracts", "signature_hash")
    op.drop_column("user_contracts", "pep_agreed_at")
