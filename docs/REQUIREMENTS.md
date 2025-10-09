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
cd server/frontend-master
npm install
```

## Конфигурация `.env`

```
DATABASE_URL=postgresql+psycopg://user:pass@host:port/db
MASTER_JWT_SECRET=...
MASTER_ACCESS_TOKEN_EXPIRE_MINUTES=120
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123
S3_BUCKET=privet-master
```

Дополнительно можно задать `SMTP_*`, `APP_VERSION` и т. п., они прокидываются через `app.core.config.Settings`.

## Миграции

- Применение: `alembic upgrade head`
- Генерация: `alembic revision --autogenerate -m "message"`

## Frontend дев-сервер

```
npm run dev --prefix server/frontend-master -- --port 5174
```

---

Перед запуском убедитесь, что в БД созданы пользователи и заполнена таблица `master_users`.
