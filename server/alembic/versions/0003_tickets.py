"""Tickets, ticket history, attachments

Revision ID: 0003_tickets
Revises: 0002_devices
Create Date: 2025-08-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0003_tickets"
down_revision = "0002_devices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Create enum types only if they don't exist (idempotent for Postgres)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status_t') THEN
                CREATE TYPE ticket_status_t AS ENUM ('accepted','in_progress','done','rejected');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'changed_by_t') THEN
                CREATE TYPE changed_by_t AS ENUM ('system','user','operator','master');
            END IF;
        END$$;
        """
    )

    # 2) Reference existing enums without creating them again
    ticket_status = postgresql.ENUM(
        'accepted', 'in_progress', 'done', 'rejected',
        name='ticket_status_t',
        create_type=False,
    )
    changed_by = postgresql.ENUM(
        'system', 'user', 'operator', 'master',
        name='changed_by_t',
        create_type=False,
    )

    # tickets
    op.create_table(
        "tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("preferred_date", sa.Date(), nullable=True),
        sa.Column("status", ticket_status, nullable=False, server_default=sa.text("'accepted'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tickets_user_status", "tickets", ["user_id", "status"]) 
    op.create_index("ix_tickets_device", "tickets", ["device_id"]) 
    op.create_index("ix_tickets_created_desc", "tickets", ["created_at"], postgresql_using="btree")

    # ticket_status_history
    op.create_table(
        "ticket_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", ticket_status, nullable=True),
        sa.Column("to_status", ticket_status, nullable=False),
        sa.Column("changed_by", changed_by, nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
    )
    op.create_index("ix_ticket_history_ticket_changed", "ticket_status_history", ["ticket_id", "changed_at"]) 

    # ticket_attachments
    op.create_table(
        "ticket_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=False),
        sa.Column("file_type", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ticket_attachments")
    op.drop_index("ix_ticket_history_ticket_changed", table_name="ticket_status_history")
    op.drop_table("ticket_status_history")
    op.drop_index("ix_tickets_created_desc", table_name="tickets")
    op.drop_index("ix_tickets_device", table_name="tickets")
    op.drop_index("ix_tickets_user_status", table_name="tickets")
    op.drop_table("tickets")

    # Drop enums last (safe: CASCADE will remove dependent defaults etc.)
    op.execute("DROP TYPE IF EXISTS changed_by_t CASCADE;")
    op.execute("DROP TYPE IF EXISTS ticket_status_t CASCADE;")
