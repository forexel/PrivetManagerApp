"""Devices and Device Photos

Revision ID: 0002_devices
Revises: 0001_init
Create Date: 2025-08-22

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002_devices"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # devices table
    op.create_table(
        "devices",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("warranty_until", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # indexes for devices
    op.create_index("ix_devices_user_id", "devices", ["user_id"], unique=False)
    op.create_index("ix_devices_serial_number", "devices", ["serial_number"], unique=False)

    # device_photos table
    op.create_table(
        "device_photos",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # index for device_photos
    op.create_index("ix_device_photos_device_id", "device_photos", ["device_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_device_photos_device_id", table_name="device_photos")
    op.drop_table("device_photos")

    op.drop_index("ix_devices_serial_number", table_name="devices")
    op.drop_index("ix_devices_user_id", table_name="devices")
    op.drop_table("devices")