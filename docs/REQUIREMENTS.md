# Требования и окружение

## Системные зависимости

- Python 3.12+
- Node.js 20+
- PostgreSQL 14+
- (опционально) MinIO/S3-совместимое хранилище для фото устройств

## Python окружение

```
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Node окружение

```
cd server/frontend-manager
npm install
```

## Конфигурация `.env`

```
DATABASE_URL=postgresql+psycopg://user:pass@host:port/db
MANAGER_JWT_SECRET=...
MANAGER_ACCESS_TOKEN_EXPIRE_MINUTES=120
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=privet-manager
```

Дополнительно можно задать `SMTP_*`, `APP_VERSION` и т. п., они прокидываются через `app.core.config.Settings`.

## Миграции

- Применение: `alembic upgrade head`
- Генерация: `alembic revision --autogenerate -m "message"`

## Frontend дев-сервер

```
npm run dev --prefix server/frontend-manager -- --port 5174
```

---

Перед запуском убедитесь, что в БД созданы пользователи и заполнена таблица `manager_users`.
