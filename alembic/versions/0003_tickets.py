"""tickets

Revision ID: 0003
Create Date: 2024-01-20
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: str = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Создаем enum типы
    op.execute("CREATE TYPE ticket_status_t AS ENUM ('accepted', 'in_progress', 'done', 'rejected')")
    op.execute("CREATE TYPE changed_by_t AS ENUM ('USER', 'STAFF', 'SYSTEM')")
    
    # Таблица tickets
    op.create_table(
        'tickets',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('user_id', postgresql.UUID(), nullable=False),
        sa.Column('device_id', postgresql.UUID(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('preferred_date', sa.Date(), nullable=True),
        sa.Column('status', sa.Enum('accepted', 'in_progress', 'done', 'rejected', name='ticket_status_t'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Вложения к тикетам
    op.create_table(
        'ticket_attachments',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('ticket_id', postgresql.UUID(), nullable=False),
        sa.Column('file_url', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # История статусов
    op.create_table(
        'ticket_status_history',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('ticket_id', postgresql.UUID(), nullable=False),
        sa.Column('from_status', sa.Enum('accepted', 'in_progress', 'done', 'rejected', name='ticket_status_t'), nullable=True),
        sa.Column('to_status', sa.Enum('accepted', 'in_progress', 'done', 'rejected', name='ticket_status_t'), nullable=False),
        sa.Column('changed_by', sa.Enum('USER', 'STAFF', 'SYSTEM', name='changed_by_t'), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('ticket_status_history')
    op.drop_table('ticket_attachments')
    op.drop_table('tickets')
    op.execute('DROP TYPE changed_by_t')
    op.execute('DROP TYPE ticket_status_t')
