# PrivetMasterApp

Приложение для мастеров, обрабатывающее заявки клиентов: верификация данных, фиксация техники, расчёт тарифа, генерация договора, подтверждение оплаты и синхронизация с поддержкой клиента. Репозиторий включает:

- FastAPI-бэкенд (`server/app`)
- React/Vite SPA для мастеров (`server/frontend-master`)
- Документацию и deploy-утилиты (`docs`, `deploy`, `scripts`)

---

## Требования и окружение

| Инструмент | Версия | Назначение |
|------------|--------|------------|
| Python     | 3.12+  | Backend (FastAPI + SQLAlchemy + Alembic) |
| Node.js    | 20+    | Frontend (Vite + React 18) |
| PostgreSQL | 14+    | Основная база (используется существующая схема `users`, `devices`) |
| MinIO/S3   | опц.   | Хранилище фото техники (S3-совместимое) |

---

## Быстрый старт (локальный)

1. **Инфраструктура**  
   База и MinIO поднимаются отдельным compose-файлом. Принято держать инфраструктуру в `/opt/apps/infra`:
   ```
   /opt/apps/infra/
     docker-compose.yml        # Postgres + MinIO
     db-init/001-init.sql      # (опционально) SQL-скрипты инициализации
   ```
   В репозитории шаблон лежит в `docker/docker-compose.yml`. Скопируйте его в `/opt/apps/infra/docker-compose.yml` и запустите:
   ```bash
   cd /opt/apps/infra
   docker compose up -d
   ```
   postgres: `postgresql://privet:privet@localhost:5432/privetdb`  
   minio UI: `http://localhost:9001` (логин `minio`, пароль `minio123`)

2. **Настройка `.env`**  
   Создайте `server/.env` на основе `server/.env.example`:
   ```
   DATABASE_URL=postgresql+psycopg://privet:privet@localhost:5432/privetdb
   JWT_SECRET=change_me_backend_secret
   MASTER_JWT_SECRET=change_me_master_secret
   MASTER_ACCESS_TOKEN_EXPIRE_MINUTES=120
   S3_ENDPOINT=http://localhost:9000
   S3_ACCESS_KEY=minio
   S3_SECRET_KEY=minio123
   S3_BUCKET=privet-bucket
   ```

3. **Бэкенд**
   ```bash
   cd server
   python -m venv .venv
   source .venv/bin/activate      # Windows: .venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   alembic upgrade head           # применить миграции master_* и support bridge
   uvicorn app.main:app --reload
   ```
   API доступен на `http://127.0.0.1:8000`, Swagger — `/docs`.

4. **Добавьте мастера**
   ```python
   # server/scripts/bootstrap_master.py
   from sqlalchemy.ext.asyncio import async_sessionmaker
   from app.core.database import engine
   from app.core.security import hash_password
   from app.master_api import crud

   async def main():
       async_session = async_sessionmaker(engine, expire_on_commit=False)
       async with async_session() as session:
           await crud.create_master(
               session,
               email="master@example.com",
               password_hash=hash_password("ChangeMe123"),
               name="Главный мастер",
           )
   ```
   Выполните в REPL или через `asyncio.run(main())`.

5. **Фронтенд**
   ```bash
   cd server/frontend-master
   npm install
   npm run dev -- --port 5174   # SPA dev-сервер
   ```
   Dev-сервер проксирует `/api/master` на FastAPI. Production-билд: `npm run build` (результат в `dist/`, FastAPI отдаёт его автоматически).

6. **Проверка загрузки медиа**
   - Создайте бакет `privet-bucket` в MinIO.
   - Через UI мастера загрузите фото устройства — фронт уменьшит изображение до 1200px по длинной стороне и сохранит в MinIO.
   - При генерации договора в support-чат клиента (приложение "Привет Супер") прилетит OTP.

---

## Основные возможности бэкенда

- `/api/master` — защищённый JWT контур для мастеров.
- Шаги обработки клиента:
  1. Контактные данные (`PATCH /clients/{id}/profile`)
  2. Паспорт (`PUT /clients/{id}/passport`)
  3. Устройства + фото (presigned MinIO) (`POST /clients/{id}/devices`)
  4. Расчёт тарифа (`POST /clients/{id}/tariff/apply`)
  5. Генерация PDF-договора и OTP (`POST /clients/{id}/contract/generate`)
  6. Подписание и оплата (`POST /contract/confirm`, `/payment/confirm`)
  7. Выставление счёта — в тикет поддержки (`POST /billing/notify`)
- При генерации договора и счетов сообщение с OTP/суммой улетает в `support_tickets/support_messages`, поэтому клиент видит его в приложении «Привет Супер».

### `/api/master` (основные эндпоинты)

| Метод | Путь | Описание |
|-------|------|----------|
| POST  | `/auth/login` | Логин мастера, выдаёт JWT |
| GET   | `/auth/me` | Профиль текущего мастера |
| GET   | `/clients?tab=new|processed|mine` | Список клиентов по вкладкам |
| GET   | `/clients/{id}` | Подробная карточка клиента |
| PATCH | `/clients/{id}/profile` | Шаг 1 — обновление контактных данных |
| PUT   | `/clients/{id}/passport` | Шаг 2 — паспорт |
| POST  | `/clients/{id}/devices` | Шаг 3 — добавить устройство |
| POST  | `/clients/{id}/devices/{device_id}/photos/upload-url` | Получить presigned URL для загрузки фото (MinIO) |
| POST  | `/clients/{id}/devices/{device_id}/photos` | Сохранить `file_key` после загрузки фото |
| POST  | `/clients/{id}/tariff/apply` | Шаг 4 — расчёт и фиксация доплаты |
| POST  | `/clients/{id}/contract/generate` | Шаг 5 — генерация договора + OTP + PDF |
| POST  | `/clients/{id}/contract/confirm` | Подписание договора по коду |
| POST  | `/clients/{id}/payment/confirm` | Шаг 6 — подтверждение оплаты |
| POST  | `/clients/{id}/billing/notify` | Выставление счёта клиенту (инвойс + сообщение в тикете) |

---

## Структура БД (новые сущности)

- `master_users` — мастера (логины).
- `master_clients` — связь с существующими `users`, статус обработки, назначенный мастер.
- `master_passports` — паспортные данные.
- `master_devices` / `master_device_photos` — техника клиента и ссылки на фото.
- `master_tariffs` / `master_client_tariffs` — тарифы и рассчитанные доплаты.
- `master_contracts` — снапшоты данных, OTP, отметки о подписи и оплате.
- `master_support_threads` / `master_support_messages` — внутренний лог мастера.
- `support_tickets` / `support_messages` — общий канал поддержки (OTP/счета для клиента).

Существующие таблицы `users` и `devices` не менялись — приложение вписывается в текущую схему.

---

## Полезные команды

```bash
# Формат/линт backend
ruff check server/app
ruff format server/app

# Прогон Alembic автогенерации (перед ревью)
alembic revision --autogenerate -m "message"

# Frontend дев-сервер
npm run dev --prefix server/frontend-master

# Frontend билд
npm run build --prefix server/frontend-master
```

---

## Отладка и полезные ссылки

- Swagger: <http://127.0.0.1:8000/docs>
- Документация по архитектуре: `docs/ARCHITECTURE.md`
- Smoke-тест договора: `pytest tests/test_contract_pdf.py`
- MinIO UI: <http://localhost:9001>

---

Если что-то сломано или нужно дополнить — создавайте issue или пишите в чат.
