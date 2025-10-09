from alembic import op
import sqlalchemy as sa

# revision identifiers:
revision = "0b445c495839"
down_revision = "34e296af6fe9"  # <-- твоя последняя ревизия по логу
branch_labels = None
depends_on = None

def upgrade():
    # 1) Добавляем 'new' в enum в отдельном autocommit-блоке (Postgres требует коммит)
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE ticket_status_t ADD VALUE IF NOT EXISTS 'new';")

    # 2) Теперь можно менять дефолт
    op.execute("ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'new';")
    
    # 3) (опционально) если хочешь перевести старые «accepted» в «new»:
    # op.execute("UPDATE tickets SET status = 'new' WHERE status = 'accepted';")

def downgrade():
    # В PostgreSQL нельзя удалить значение из ENUM.
    # Откатываем только дефолт обратно на 'accepted'.
    op.execute("ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'accepted';")