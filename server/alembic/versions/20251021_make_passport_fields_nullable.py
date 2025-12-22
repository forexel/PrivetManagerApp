"""Make passport fields nullable"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20251021_make_passport_fields_nullable"
down_revision = "20241007_rename_passport"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users_passports", "last_name", existing_type=sa.String(length=128), nullable=True)
    op.alter_column("users_passports", "first_name", existing_type=sa.String(length=128), nullable=True)
    op.alter_column("users_passports", "series", existing_type=sa.String(length=16), nullable=True)
    op.alter_column("users_passports", "number", existing_type=sa.String(length=16), nullable=True)
    op.alter_column("users_passports", "issued_by", existing_type=sa.String(length=256), nullable=True)
    op.alter_column("users_passports", "issue_code", existing_type=sa.String(length=16), nullable=True)
    op.alter_column("users_passports", "issue_date", existing_type=sa.Date(), nullable=True)
    op.alter_column("users_passports", "registration_address", existing_type=sa.String(length=512), nullable=True)


def downgrade() -> None:
    op.alter_column("users_passports", "registration_address", existing_type=sa.String(length=512), nullable=False)
    op.alter_column("users_passports", "issue_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("users_passports", "issue_code", existing_type=sa.String(length=16), nullable=False)
    op.alter_column("users_passports", "issued_by", existing_type=sa.String(length=256), nullable=False)
    op.alter_column("users_passports", "number", existing_type=sa.String(length=16), nullable=False)
    op.alter_column("users_passports", "series", existing_type=sa.String(length=16), nullable=False)
    op.alter_column("users_passports", "first_name", existing_type=sa.String(length=128), nullable=False)
    op.alter_column("users_passports", "last_name", existing_type=sa.String(length=128), nullable=False)
