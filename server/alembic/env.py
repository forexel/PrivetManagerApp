# /Users/d.yudin/PrivetSuperApp/server/alembic/env.py
from __future__ import annotations

import os
import sys
from pathlib import Path
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# 1) Добавляем в sys.path корень проекта (…/server), чтобы работал "import app"
BASE_DIR = Path(__file__).resolve().parents[1]  # .../server
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# 2) Теперь можно безопасно импортировать настройки БД и модели
from app.core.database import SQLALCHEMY_DATABASE_URL, Base  # noqa: E402
import app.models  # noqa: F401  ← ВАЖНО: прогружает все модели через агрегатор

# 3) Alembic config + логирование
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 4) URL БД: env-переменная имеет приоритет, затем fallback из приложения
config.set_main_option(
    "sqlalchemy.url",
    os.getenv("DATABASE_URL", SQLALCHEMY_DATABASE_URL),
)

# 5) Метаданные (все таблицы внутри Base.metadata)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Запуск миграций в оффлайн-режиме."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,             # сравнение типов колонок (ENUM и т.п.)
        compare_server_default=True,   # сравнение server_default
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Запуск миграций в онлайн-режиме."""
    connectable = engine_from_config(
        {"sqlalchemy.url": config.get_main_option("sqlalchemy.url")},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()