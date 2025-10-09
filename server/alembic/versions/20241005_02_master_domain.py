"""master domain schema

Revision ID: 20241005_02
Revises: 20241005_01_create_master_users.py
Create Date: 2024-10-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20241005_02"
down_revision = "20241005_01_create_master_users.py"
branch_labels = None
depends_on = None

client_status_enum = sa.Enum(
    "new",
    "in_verification",
    "awaiting_contract",
    "awaiting_payment",
    "processed",
    name="master_client_status_t",
)

support_sender_enum = sa.Enum("master", "client", "system", name="support_sender_t")
invoice_status_enum = sa.Enum("pending", "paid", "canceled", name="invoice_status_t")


def upgrade() -> None:
    client_status_enum.create(op.get_bind(), checkfirst=True)
    support_sender_enum.create(op.get_bind(), checkfirst=True)
    invoice_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "master_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_master_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", client_status_enum, nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_passports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_clients.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("last_name", sa.String(length=128), nullable=False),
        sa.Column("first_name", sa.String(length=128), nullable=False),
        sa.Column("middle_name", sa.String(length=128), nullable=True),
        sa.Column("series", sa.String(length=16), nullable=False),
        sa.Column("number", sa.String(length=16), nullable=False),
        sa.Column("issued_by", sa.String(length=256), nullable=False),
        sa.Column("issue_code", sa.String(length=16), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("registration_address", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_tariffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("base_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("extra_per_device", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_client_tariffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_clients.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tariff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_tariffs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("device_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_extra_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("specs", sa.JSON(), nullable=True),
        sa.Column("extra_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_device_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_key", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_contracts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_clients.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tariff_snapshot", sa.JSON(), nullable=False),
        sa.Column("passport_snapshot", sa.JSON(), nullable=False),
        sa.Column("device_snapshot", sa.JSON(), nullable=False),
        sa.Column("otp_code", sa.String(length=16), nullable=True),
        sa.Column("otp_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contract_url", sa.String(length=512), nullable=True),
        sa.Column("contract_number", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_support_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_support_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_support_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender", support_sender_enum, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "master_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("master_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("contract_number", sa.String(length=64), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", invoice_status_enum, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("master_contracts")
    op.drop_table("master_invoices")
    op.drop_table("master_support_messages")
    op.drop_table("master_support_threads")
    op.drop_table("master_device_photos")
    op.drop_table("master_devices")
    op.drop_table("master_client_tariffs")
    op.drop_table("master_tariffs")
    op.drop_table("master_passports")
    op.drop_table("master_clients")
    support_sender_enum.drop(op.get_bind(), checkfirst=True)
    invoice_status_enum.drop(op.get_bind(), checkfirst=True)
    client_status_enum.drop(op.get_bind(), checkfirst=True)
