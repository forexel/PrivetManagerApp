"""Link user_invoices.client_id to users.id

Revision ID: 20251022_fix_user_invoices_client_fk
Revises: 20251021_make_passport_fields_nullable
Create Date: 2025-10-22
"""

from __future__ import annotations

from alembic import op


revision = "20251022_fix_user_invoices_client_fk"
down_revision = "20251021_make_passport_fields_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE user_invoices DROP CONSTRAINT IF EXISTS user_invoices_client_id_fkey")
    op.execute(
        """
        UPDATE user_invoices ui
        SET client_id = mc.user_id
        FROM manager_clients mc
        WHERE ui.client_id = mc.id
        """
    )
    op.create_foreign_key(
        "user_invoices_client_id_fkey",
        "user_invoices",
        "users",
        ["client_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE user_invoices DROP CONSTRAINT IF EXISTS user_invoices_client_id_fkey")
    op.execute(
        """
        UPDATE user_invoices ui
        SET client_id = mc.id
        FROM manager_clients mc
        WHERE ui.client_id = mc.user_id
        """
    )
    op.create_foreign_key(
        "user_invoices_client_id_fkey",
        "user_invoices",
        "manager_clients",
        ["client_id"],
        ["id"],
        ondelete="CASCADE",
    )
