"""Add has_subscription flag to users

Revision ID: 57df349fc4c7
Revises: 0005_subscriptions
Create Date: 2025-08-23
"""
from alembic import op
import sqlalchemy as sa

# Alembic identifiers
revision = '57df349fc4c7'
down_revision = '0005_subscriptions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "has_subscription",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Бэкфилл: отметить пользователей с активной подпиской
    op.execute(
        """
        UPDATE users AS u
        SET has_subscription = EXISTS (
            SELECT 1
            FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.active IS TRUE
        );
        """
    )


def downgrade() -> None:
    op.drop_column("users", "has_subscription")