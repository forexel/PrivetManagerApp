"""Rename master_passports to users_passports and add photo_url.

Revision ID: 20241007_rename_passport
Revises: 20241005_03_link_master_clients_support.py
Create Date: 2024-10-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20241007_rename_passport"
down_revision = "20241005_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "master_users",
        sa.Column("is_super_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.rename_table("master_passports", "users_passports")
    op.add_column("users_passports", sa.Column("photo_url", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("users_passports", "photo_url")
    op.rename_table("users_passports", "master_passports")
    op.drop_column("master_users", "is_super_admin")
