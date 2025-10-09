# PrivetMasterApp — Архитектура

_Обновлено: 2024-10-05_

## Общая структура

```
PrivetMasterApp/
├── README.md                  # инструкции по развёртыванию
├── docs/                      # документация (архитектура, схемы)
├── server/                    # исходники бекэнда + SPA мастеров
│   ├── app/                   # FastAPI приложение
│   ├── frontend-master/       # React/Vite SPA
│   ├── alembic/               # миграции БД
│   └── requirements.txt
├── docker/                    # шаблон docker-compose с Postgres и MinIO
└── deploy/                    # примеры конфигов (Caddy, systemd)
```

Основные потоки разделены между бэкендом (FastAPI) и фронтендом (React). Infrastructure-папка в бою переезжает в `/opt/apps/infra`, в репозитории лежит только шаблон.

---

## Backend (`server/app`)

### Каркас

```
app/
├── main.py                     # точка входа FastAPI
├── core/                       # конфиг, БД, безопасность
│   ├── config.py               # pydantic Settings (.env)
│   ├── database.py             # async engine + сессии
│   └── security.py             # hash/jwt для основной части
├── models/                     # SQLAlchemy модели общего слоя
│   ├── users.py                # таблица users
│   ├── devices.py              # устройства клиента (наследие)
│   ├── support.py              # shared support_tickets/support_messages
│   └── __init__.py             # экспорт моделей для Alembic
├── master_api/                 # контур мастеров
│   ├── models.py               # master_* таблицы, enum-ы
│   ├── schemas.py              # Pydantic-модели API
│   ├── crud.py                 # все обращения к БД
│   ├── router.py               # FastAPI маршруты /api/master
│   ├── deps.py                 # Depends (current master, sessions)
│   └── security.py             # JWT для мастеров
└── services/                   # бизнес-сервисы
    ├── contracts.py            # генерация PDF договора (ReportLab + шаблон)
    ├── storage.py              # MinIO/S3 helper (presigned upload, delete)
    └── support_bridge.py       # мост в общий support (создание тикетов и сообщений)
```

### Поток данных

1. **Авторизация мастера** — `MasterUser`, JWT `HS256` (`master_api/security.py`).
2. **Обработка клиента** — `router.py` orchestrates шаги, `crud.py` работает с таблицами `master_clients`, `master_passports`, `master_devices`, `master_contracts`, `master_invoices`.
3. **Медиа** — пресайн в `storage_service.generate_presigned_post`, фронт грузит файл напрямую в MinIO, `add_device_photo` сохраняет `file_key`.
4. **Договор** — `build_contract_pdf` использует текстовый шаблон `services/templates/contract_template.txt`, сохраняет PDF в MinIO и обновляет `master_contracts`.
5. **Поддержка** — `SupportBridgeService`:
   - ищет/создаёт тикет в `support_tickets` (`app/models/support.py`),
   - связывает тикет с `master_clients.support_ticket_id`,
   - добавляет системные сообщения (`support_messages`) с OTP и суммой счёта, чтобы клиент видел их в приложении «Привет Супер».
   Внутренний лог мастера по-прежнему хранится в `master_support_threads/master_support_messages`.

### Миграции

- `20241005_01_create_master_users.py` — таблица мастеров.
- `20241005_02_master_domain.py` — доменные таблицы master_*.
- `20241005_03_link_master_clients_support.py` — `support_ticket_id` + FK на `support_tickets`.
- Старые миграции из общего проекта (`34e296af6fe9…`, `865cbc827c40…`) создают shared support-структуры.

---

## Frontend (`server/frontend-master`)

```
src/
├── lib/
│   ├── api-client.ts     # REST-клиент /api/master (fetch + типы)
│   ├── auth.ts           # работа с access_token в localStorage
│   ├── auth-context.tsx  # React context (token/logout)
│   ├── image.ts          # ресайз изображений до 1200px перед загрузкой
│   └── use-api.ts        # обёртка, возвращающая api-client с токеном
├── modules/
│   ├── auth/LoginPage.tsx         # экран логина
│   ├── dashboard/DashboardLayout.tsx
│   └── clients/
│       ├── ClientsPage.tsx        # табы «Новые / Обработанные / Мои»
│       └── ClientDetailPage.tsx   # пошаговая карточка клиента (6 шагов + биллинг)
├── App.tsx                        # роутинг и guarded layout
└── styles/global.css              # общие стили (auth + layout + формы)
```

Особенности:

- TanStack Query управляет состоянием списков и карточки.
- React Hook Form + Zod — валидация форм (паспорт, анкета, биллинг).
- При загрузке фото файл сначала ресайзится в браузере (`lib/image.ts`), затем грузится по presigned URL (MinIO), и только после этого backend получает `file_key`.
- В карточке клиента отображаются ссылки на фото, на договор, история выставленных счетов и ссылка обратно в список таба.

---

## Инфраструктура и деплой

- **Инфраструктура локально/прод**: `/opt/apps/infra/docker-compose.yml` поднимает PostgreSQL + MinIO. Пример конфигурации в `docker/docker-compose.yml`.
- **Backend сервис**: запускается через systemd unit (`deploy/privet-api.service`) + reverse proxy (пример — `deploy/Caddyfile`).
- **Параметры окружения**: `server/.env.example` содержит все ключи (JWT, MinIO, SMTP, метаданные).
- **Static SPA**: после `npm run build --prefix server/frontend-master` билд попадает в `server/frontend-master/dist`. FastAPI (`app/main.py`) монтирует `/assets` и отдаёт `index.html` при любых путях, так что отдельный фронт-сервер не нужен.

---

## Поток мастера (end-to-end)

1. Мастер авторизуется (JWT).
2. На вкладке «Новые» выбирает клиента.
3. Подтверждает/правит контактные данные → статус `IN_VERIFICATION`.
4. Вносит паспорт.
5. Добавляет устройства и фото.
6. Рассчитывает доплату → статус `AWAITING_CONTRACT`.
7. Генерирует договор → создаётся PDF, OTP уходит:
   - в `master_support_messages` (лог мастера),
   - в `support_messages` (видно клиенту и поддержке в «Привет Супер»).
8. Подписывает договор (ввод OTP), подтверждает оплату → статус `PROCESSED`, клиент появляется во вкладках «Обработанные» и «Мои».
9. При необходимости отправляет счёт — сообщение также улетает в support.

---

## Полезные файлы

- `server/app/services/support_bridge.py` — единая точка интеграции с общим support.
- `server/app/services/templates/contract_template.txt` — шаблон договора для ReportLab.
- `server/app/services/storage.py` — presigned URL, прямые загрузки, удаление объектов в MinIO.
- `server/app/master_api/router.py` — основной сценарий мастера (контроллер).
- `server/frontend-master/src/modules/clients/ClientDetailPage.tsx` — UI всех шагов, взаимодействие с API.
- `README.md` — актуальные инструкции по запуску.

Документ обновляйте при изменении структуры файлов или бизнес-потока.
