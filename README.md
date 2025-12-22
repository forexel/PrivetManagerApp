# PrivetManagerApp

Приложение для менеджеров, обрабатывающее заявки клиентов: верификация данных, фиксация техники, расчёт тарифа, генерация договора, подтверждение оплаты и синхронизация с поддержкой клиента. Репозиторий включает:

- FastAPI-бэкенд (`server/app`)
- React/Vite SPA для менеджеров (`server/frontend-manager`) с многошаговым визардом обработки клиента
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

1. **Инфраструктура (Postgres + MinIO)**  
   База и MinIO поднимаются отдельным compose‑файлом. Принято держать инфраструктуру в `/apps/infra`:
   ```
   /apps/infra/
     docker-compose.yml        # Postgres + MinIO
     db-init/001-init.sql      # (опционально) SQL-скрипты инициализации
   ```
   В репозитории шаблон лежит в `docker/docker-compose.yml`. Скопируйте его в `/apps/infra/docker-compose.yml` и запустите:
   ```bash
   cd /apps/infra
   docker compose up -d
   ```
   postgres: `postgresql://privet:privet@localhost:5432/privetdb`  
   minio UI: `http://localhost:9001` (логин `minioadmin`, пароль `minioadmin`)

2. **Настройка `.env`**  
   Создайте `server/.env` на основе `server/.env.example`:
   ```
   DATABASE_URL=postgresql+psycopg://privet:privet@localhost:5432/privetdb
   JWT_SECRET=change_me_backend_secret
   MANAGER_JWT_SECRET=change_me_manager_secret
   MANAGER_ACCESS_TOKEN_EXPIRE_MINUTES=120
   S3_ENDPOINT=http://localhost:9000
   S3_ACCESS_KEY=minioadmin
   S3_SECRET_KEY=minioadmin
   S3_BUCKET=privet-bucket
   CONTRACT_SIGNATURE_SECRET=change_me_signature
   ```

3. **Бэкенд**
   ```bash
   cd server
   python -m venv .venv
   source .venv/bin/activate      # Windows: .venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   alembic upgrade head           # применить миграции manager_* и support bridge
   uvicorn app.main:app --reload
   ```
   API доступен на `http://127.0.0.1:8000`, Swagger — `/docs`.

4. **Добавьте менеджера**
   ```python
   # server/scripts/bootstrap_manager.py
   from sqlalchemy.ext.asyncio import async_sessionmaker
   from app.core.database import engine
   from app.core.security import hash_password
   from app.manager_api import crud

   async def main():
       async_session = async_sessionmaker(engine, expire_on_commit=False)
       async with async_session() as session:
           await crud.create_manager(
               session,
               email="manager@example.com",
               password_hash=hash_password("ChangeMe123"),
               name="Главный мастер",
           )
   ```
   Выполните в REPL или через `asyncio.run(main())`.

5. **Фронтенд**
   ```bash
   cd server/frontend-manager
   npm install
   npm run dev -- --port 5174   # SPA dev-сервер
   ```
   Dev-сервер проксирует `/api/manager` на FastAPI. Production-билд: `npm run build` (результат в `dist/`, FastAPI отдаёт его автоматически).

6. **Проверка загрузки медиа**
   - Создайте бакет `privet-bucket` в MinIO.
   - Через UI менеджера загрузите фото устройства — фронт уменьшит изображение до 1200px по длинной стороне и сохранит в MinIO.
   - При генерации договора в support-чат клиента (приложение "Привет Супер") прилетит OTP.

---

## Основные возможности бэкенда

- `/api/manager` — защищённый JWT контур для менеджеров. `/clients` возвращает краткие карточки с адресом регистрации (`registration_address`), чтобы список сразу показывал место проживания клиента.
- Шаги обработки клиента:
  1. Контактные данные (`PATCH /clients/{id}/profile`)
  2. Паспорт (`PUT /clients/{id}/passport`)
  3. Устройства + фото (presigned MinIO) (`POST /clients/{id}/devices`)
  4. Расчёт тарифа (`POST /clients/{id}/tariff/apply`)
  5. Генерация PDF-договора и OTP (`POST /clients/{id}/contract/generate`)
  6. Подписание и оплата (`POST /contract/confirm`, `/payment/confirm`)
  7. Выставление счёта — в тикет поддержки (`POST /billing/notify`)
- При генерации договора и счетов сообщение с OTP/суммой улетает в `support_tickets/support_messages`, поэтому клиент видит его в приложении «Привет Супер».
- При подтверждении OTP формируется ПЭП‑след: хэш PDF, HMAC‑подпись, `signed_at`, `pep_agreed_at`, IP и User‑Agent.

### `/api/manager` (основные эндпоинты)

| Метод | Путь | Описание |
|-------|------|----------|
| POST  | `/auth/login` | Логин менеджера, выдаёт JWT |
| GET   | `/auth/me` | Профиль текущего менеджера |
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

## Интерфейс менеджера (SPA)

Фронтенд разбит на независимые шаги — каждый соответствует отдельному экрану и маршруту:

1. **Список клиентов** (`/clients?tab=…`)  
   - быстрый поиск, статусы, адрес клиента (поле `registration_address`);
   - нижняя навигация по табам «Новые / Обработанные / Мои / В работе».
2. **Шаг 1 — Данные** (`/clients/:id/step/1`)  
   - редактирование телефона, email, имени и адреса регистрации с разбором по полям;
   - сохранение профиля и переход к паспорту.
3. **Шаг 2 — Паспорт** (`/clients/:id/step/2`)  
   - чтение паспорта в карточке, возможность вернуться к шагу 1 для правок.
4. **Шаг 3 — Устройства** (`/clients/:id/step/3`)  
   - список сохранённых устройств, модальное добавление устройства и фото.
5. **Шаг 4 — Договор** (`/clients/:id/step/4`)  
   - генерация договора, ввод OTP, переход к финальному экрану.
6. **Финал** (`/clients/:id/step/success`)  
   - успех без счёта или с напоминанием об оплате, возврат к списку.

Базовые стили лежат в `src/styles/` и переиспользуются всеми экранами.

---

## Структура БД (новые сущности)

- `manager_users` — менеджера (логины).
- `manager_clients` — связь с существующими `users`, статус обработки, назначенный мастер.
- `users_passports` — паспортные данные.
- `manager_devices` / `manager_device_photos` — техника клиента и ссылки на фото.
- `manager_tariffs` / `manager_client_tariffs` — тарифы и рассчитанные доплаты.
- `manager_contracts` — снапшоты данных, OTP, отметки о подписи и оплате.
- `manager_support_threads` / `manager_support_messages` — внутренний лог менеджера.
- `support_tickets` / `support_messages` — общий канал поддержки (OTP/счета для клиента).

Существующие таблицы `users` и `devices` не менялись — приложение вписывается в текущую схему.

---

## Развёртывание в Docker

### Вариант A. Только API (используем внешние Postgres и MinIO)

1. Скопируйте шаблон переменных и отредактируйте его под свою инфраструктуру:
   ```bash
   cp docker/.env.example docker/.env
   # правим DATABASE_URL, S3_ENDPOINT, MANAGER_JWT_SECRET и т.д.
   ```
2. Запускайте команды с явным указанием compose-файла:
   ```bash
   docker compose -f docker/docker-compose.yml build privet_manager_api privet_manager_migrator
   docker compose -f docker/docker-compose.yml --profile migrate run --rm privet_manager_migrator
   docker compose -f docker/docker-compose.yml up -d privet_manager_api
   ```
   > Если выполняете `docker compose` не из каталога `docker/`, не забудьте ключ `-f`. Ошибка `no such service: privet_manager_api` означает, что Docker прочитал другой compose.
3. API будет доступен на `http://localhost:8000` (Swagger — `/docs`).

### Вариант B. Полный стек (PostgreSQL + MinIO + API)

1. Создайте каталог, например `/apps/infra/privet_manager`, и скопируйте туда файлы:
   ```bash
   cp docker/docker-compose.full.yml /apps/infra/privet_manager/docker-compose.yml
   cp docker/.env.example /apps/infra/privet_manager/.env
   ```
2. Запустите сборку и миграции:
   ```bash
   cd /apps/infra/privet_manager
   docker compose build privet_manager_api privet_manager_migrator
   docker compose --profile migrate run --rm privet_manager_migrator
   docker compose up -d privet_manager_db privet_manager_minio privet_manager_api
   ```
3. После запуска API доступен на `http://localhost:8000`, MinIO — `http://localhost:9001` (логин/пароль `minioadmin/minioadmin`).

> Если Postgres и MinIO уже запущены отдельно, не поднимайте `privet_manager_db` и `privet_manager_minio` — достаточно указать их адреса в `.env` и запускать только `privet_manager_api`.

### Вариант C. API + внешний infra (рекомендовано для прод)

1. Поднимите инфраструктуру отдельно (см. раздел “Быстрый старт”, пункт 1) или используйте существующие Postgres/MinIO.
2. В `/apps/infra/privet_manager` храните только `.env` и `docker-compose.yml` приложения, инфраструктура остаётся в `/apps/infra`.
3. Запуск:
   ```bash
   docker compose -f docker/docker-compose.yml build privet_manager_api privet_manager_migrator
   docker compose -f docker/docker-compose.yml --profile migrate run --rm privet_manager_migrator
   docker compose -f docker/docker-compose.yml up -d privet_manager_api
   ```
4. Проверка:
   - API: `http://localhost:8000/docs`
   - MinIO UI: `http://localhost:9001`
   - Бакет: `privet-bucket`

### Миграции при общей БД (PrivetSuper + PrivetManager)

Если два проекта используют одну БД, у них должна быть независимая история Alembic.  
В менеджерском приложении это сделано через отдельную таблицу версий:

```
server/alembic.ini
version_table = privet_manager_alembic_version
```

Так:
- "Привет Супер" продолжает жить со своей `alembic_version`
- PrivetManagerApp ведёт отдельную историю
- последовательности не конфликтуют

### Baseline: принять текущую БД как актуальную

Если БД уже существует и нужно принять её как старт:

1. Создайте пустую ревизию:
   ```bash
   alembic revision -m "baseline"
   ```
2. Оставьте `upgrade()` пустым (без операций).
3. Пометьте БД как уже находящуюся на этой ревизии:
   ```bash
   alembic stamp <ID_ревизии>
   ```
4. Дальше генерируйте обычные миграции:
   ```bash
   alembic revision --autogenerate -m "add_manager_tables"
   ```

### Синхронизация пользователей в контуре менеджера

Менеджерская часть использует таблицу `manager_clients`.  
Если в БД уже есть пользователи, но в списке менеджера виден только один:

```bash
python server/scripts/backfill_manager_clients.py
```

Скрипт создаёт записи в `manager_clients` для всех пользователей, которых ещё нет в менеджерском контуре.

### Обновление/перекат (docker)

1. Остановить контейнеры приложения:
   ```bash
   docker compose -f docker/docker-compose.yml down
   ```
2. Подтянуть изменения и пересобрать:
   ```bash
   git pull
   docker compose -f docker/docker-compose.yml build privet_manager_api privet_manager_migrator
   ```
3. Прогнать миграции и запустить:
   ```bash
   docker compose -f docker/docker-compose.yml --profile migrate run --rm privet_manager_migrator
   docker compose -f docker/docker-compose.yml up -d privet_manager_api
   ```

### Buckets и MinIO

- При использовании внешнего MinIO создайте бакет `privet-bucket` и пропишите его в `.env`.
- При использовании встроенного сервиса `privet_manager_minio` бакет можно создать через веб-интерфейс (порт 9001).

---

## WebView (App Store)

Менеджерское SPA отдаётся с backend по корню `/` (FastAPI возвращает `index.html` и `/assets/*`). Для WebView достаточно открыть URL:

```
https://<manager-host>/
```

Примечания:
- В `frontend-manager/index.html` включён `viewport-fit=cover` для safe‑area.
- `index.html` отдаётся с `Cache-Control: no-store`, чтобы WebView не держал старую оболочку.


## Полезные команды

```bash
# Формат/линт backend
ruff check server/app
ruff format server/app

# Прогон Alembic автогенерации (перед ревью)
alembic revision --autogenerate -m "message"

# Frontend дев-сервер
npm run dev --prefix server/frontend-manager

# Frontend билд
npm run build --prefix server/frontend-manager
```

---

## Отладка и полезные ссылки

- Swagger: <http://127.0.0.1:8000/docs>
- Документация по архитектуре: `docs/ARCHITECTURE.md`
- Smoke-тест договора: `pytest tests/test_contract_pdf.py`
- MinIO UI: <http://localhost:9001>

---

Если что-то сломано или нужно дополнить — создавайте issue или пишите в чат.
