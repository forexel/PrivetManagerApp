"""Subscriptions table + enums

Revision ID: 0005_subscriptions
Revises: 0003_tickets
Create Date: 2025-08-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

# Alembic identifiers
revision = "0005_subscriptions"
down_revision = "0004_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create PostgreSQL ENUM types (idempotent)
    plan_enum = sa.Enum("simple", "medium", "premium", name="tariff_plan_t")
    period_enum = sa.Enum("month", "year", name="tariff_period_t")

    # subscriptions table
    op.create_table(
        "subscriptions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan", plan_enum, nullable=False),
        sa.Column("period", period_enum, nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("paid_until", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])


def downgrade() -> None:
    # Достаточно дропнуть таблицу — индексы уедут каскадом.
    op.drop_table("subscriptions")
    # Если нужно, чистку enum-типов вынеси в отдельную миграцию.
