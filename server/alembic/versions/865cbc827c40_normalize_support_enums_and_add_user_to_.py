"""Normalize support enums; add USER to changed_by; ensure tickets default 'new'"""

from __future__ import annotations
from alembic import op
import sqlalchemy as sa

# Идентификаторы ревизии
revision = "865cbc827c40"
down_revision = "35b0_merge_heads"  # ← если у тебя другой предыдущий хеш — подставь его
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Создать тип supportcasestatus, если ещё нет
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='supportcasestatus') THEN
            CREATE TYPE supportcasestatus AS ENUM ('open','pending','resolved','closed');
          END IF;
        END$$;
        """
    )

    # 2) Привести support_tickets.status к supportcasestatus и выставить дефолт
    # (без DO/EXECUTE — три обычных ALTER, чтобы не ловить синтаксические ошибки кавычек)
    op.execute("ALTER TABLE support_tickets ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE support_tickets "
        "ALTER COLUMN status TYPE supportcasestatus "
        "USING status::text::supportcasestatus"
    )
    op.execute(
        "ALTER TABLE support_tickets "
        "ALTER COLUMN status SET DEFAULT 'open'::supportcasestatus"
    )

    # 3) В enum changed_by_t добавить 'USER' (если отсутствует).
    # ALTER TYPE ... ADD VALUE требует автокоммита.
    with op.get_context().autocommit_block():
        op.execute(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM pg_type t
                JOIN pg_enum e ON e.enumtypid = t.oid
                WHERE t.typname = 'changed_by_t' AND e.enumlabel = 'USER'
              ) THEN
                ALTER TYPE changed_by_t ADD VALUE 'USER';
              END IF;
            END$$;
            """
        )

    # 4) Убедиться, что в ticket_status_t есть 'new', и дефолт для tickets.status = 'new'
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE ticket_status_t ADD VALUE IF NOT EXISTS 'new';")

    op.execute("ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'new'")


def downgrade() -> None:
    # Частичный безопасный откат:
    # 1) вернуть дефолт для tickets.status
    op.execute("ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'accepted'")

    # 2) support_tickets.status вернуть в TEXT (тип supportcasestatus оставляем, чтобы не поломать другие объекты)
    op.execute("ALTER TABLE support_tickets ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE support_tickets "
        "ALTER COLUMN status TYPE TEXT "
        "USING status::text"
    )

    # 3) Значение 'USER' в changed_by_t назад не удаляем (в PostgreSQL это небезопасно без переноса данных).