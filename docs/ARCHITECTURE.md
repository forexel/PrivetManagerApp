# PrivetManagerApp — Архитектура

_Обновлено: 2024-10-06_

## Общая структура

```
PrivetManagerApp/
├── README.md                  # инструкции по развёртыванию
├── docs/                      # документация (архитектура, схемы)
├── server/                    # исходники бекэнда + SPA менеджеров
│   ├── app/                   # FastAPI приложение
│   ├── frontend-manager/       # React/Vite SPA
│   ├── alembic/               # миграции БД
│   └── requirements.txt
├── docker/                    # шаблон docker-compose с Postgres и MinIO
└── deploy/                    # примеры конфигов (Caddy, systemd)
```

Основные потоки разделены между бэкендом (FastAPI) и фронтендом (React). Infrastructure-папка в бою переезжает в `/apps/infra`, в репозитории лежит только шаблон.

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
├── manager_api/                 # контур менеджеров
│   ├── models.py               # manager_* таблицы, enum-ы
│   ├── schemas.py              # Pydantic-модели API
│   ├── crud.py                 # все обращения к БД
│   ├── router.py               # FastAPI маршруты /api/manager
│   ├── deps.py                 # Depends (current manager, sessions)
│   └── security.py             # JWT для менеджеров
└── services/                   # бизнес-сервисы
    ├── contracts.py            # генерация PDF договора (ReportLab + шаблон)
    ├── storage.py              # MinIO/S3 helper (presigned upload, delete)
    └── support_bridge.py       # мост в общий support (создание тикетов и сообщений)
```

### Поток данных

1. **Авторизация менеджера** — `ManagerUser`, JWT `HS256` (`manager_api/security.py`).
2. **Обработка клиента** — `router.py` orchestrates шаги, `crud.py` работает с таблицами `manager_clients`, `users_passports`, `manager_devices`, `manager_contracts`, `manager_invoices`. Список клиентов (`GET /clients`) подтягивает `users_passports.registration_address`, чтобы фронт не делал отдельный вызов за адресом.
3. **Медиа** — пресайн в `storage_service.generate_presigned_post`, фронт грузит файл напрямую в MinIO, `add_device_photo` сохраняет `file_key`.
4. **Договор** — `build_contract_pdf` использует текстовый шаблон `services/templates/contract_template.txt`, сохраняет PDF в MinIO и обновляет `manager_contracts`.
5. **Поддержка** — `SupportBridgeService`:
   - ищет/создаёт тикет в `support_tickets` (`app/models/support.py`),
   - связывает тикет с `manager_clients.support_ticket_id`,
   - добавляет системные сообщения (`support_messages`) с OTP и суммой счёта, чтобы клиент видел их в приложении «Привет Супер».
   Внутренний лог менеджера по-прежнему хранится в `manager_support_threads/manager_support_messages`.

### Миграции

- `20241005_01_create_manager_users.py` — таблица менеджеров.
- `20241005_02_manager_domain.py` — доменные таблицы manager_*.
- `20241005_03_link_manager_clients_support.py` — `support_ticket_id` + FK на `support_tickets`.
- Старые миграции из общего проекта (`34e296af6fe9…`, `865cbc827c40…`) создают shared support-структуры.

---

## Frontend (`server/frontend-manager`)

```
src/
├── lib/
│   ├── api-client.ts     # REST-клиент /api/manager (fetch + типы)
│   ├── auth.ts           # работа с access_token в localStorage
│   ├── auth-context.tsx  # React context (token/logout)
│   ├── image.ts          # ресайз изображений до 1200px перед загрузкой
│   └── use-api.ts        # обёртка, возвращающая api-client с токеном
├── modules/
│   ├── auth/LoginPage.tsx                # экран логина
│   ├── dashboard/DashboardLayout.tsx     # контейнер с нижним меню
│   └── clients/
│       ├── ClientsPage.tsx               # список заявок + табы
│       ├── ClientStep1Detailes.tsx       # шаг 1 — профиль и адрес
│       ├── ClientStep2ID.tsx             # шаг 2 — паспорт
│       ├── ClientStep3Devices.tsx        # шаг 3 — устройства
│       ├── DeviceFormModal.tsx           # модалка добавления устройства
│       ├── ClientStep4Contract.tsx       # шаг 4 — договор и OTP
│       └── ClientStepSuccess.tsx         # финальный экран
├── App.tsx                        # роутинг и guarded layout
└── styles/global.css              # общие стили (auth + layout + формы)
```

Особенности:

- TanStack Query управляет табами списка и кешем шагов (`ClientsPage` + `useQuery`/`useMutation`).
- React Hook Form + Zod используются на шагах 1, 3 и 4 для валидации форм (профиль, устройство, OTP/биллинг).
- При загрузке фото файл ресайзится в браузере (`lib/image.ts`), затем отправляется в MinIO по presigned URL, после чего в API передаётся `file_key`.
- Каждый шаг живёт на собственном роуте; состояние (например, рассчитанная доплата) тянется из общего кэша `react-query`, поэтому после перехода назад данные не теряются.
- Список клиентов сразу отображает `registration_address`, полученный из краткого API, и использует обновлённый дизайн поиска/нижнего меню.

---

## Инфраструктура и деплой

- **Инфраструктура**: в репозитории лежат два compose-файла.
  - `docker/docker-compose.yml` — минимальный вариант, содержащий только `privet_manager_api` и `privet_manager_migrator` (подключается к внешним Postgres/MinIO).
  - `docker/docker-compose.full.yml` — полный стек с `privet_manager_db` и `privet_manager_minio` для локальных стендов. Сервисы и сеть переименованы под новый бренд (`privet_manager_*`).
  В README описаны оба сценария запуска.
- **Backend сервис**: запускается через systemd unit (`deploy/privet-api.service`) + reverse proxy (пример — `deploy/Caddyfile`).
- **Параметры окружения**: `server/.env.example` содержит все ключи (JWT, MinIO, SMTP, метаданные).
- **Static SPA**: после `npm run build --prefix server/frontend-manager` билд попадает в `server/frontend-manager/dist`. FastAPI (`app/main.py`) монтирует `/assets` и отдаёт `index.html` при любых путях, так что отдельный фронт-сервер не нужен.

---

## Поток менеджера (end-to-end)

1. Менеджер авторизуется (JWT).
2. На вкладке «Новые» выбирает клиента.
3. Подтверждает/правит контактные данные → статус `IN_VERIFICATION`.
4. Вносит паспорт.
5. Добавляет устройства и фото.
6. Рассчитывает доплату → статус `AWAITING_CONTRACT`.
7. Генерирует договор → создаётся PDF, OTP уходит:
   - в `manager_support_messages` (лог менеджера),
   - в `support_messages` (видно клиенту и поддержке в «Привет Супер»).
8. Подписывает договор (ввод OTP), подтверждает оплату → статус `PROCESSED`, клиент появляется во вкладках «Обработанные» и «Мои».
9. При необходимости отправляет счёт — сообщение также улетает в support.

---

## Полезные файлы

- `server/app/services/support_bridge.py` — единая точка интеграции с общим support.
- `server/app/services/templates/contract_template.txt` — шаблон договора для ReportLab.
- `server/app/services/storage.py` — presigned URL, прямые загрузки, удаление объектов в MinIO.
- `server/app/manager_api/router.py` — основной сценарий менеджера (контроллер).
- `server/frontend-manager/src/modules/clients/` — шаги визарда (`ClientStep1Detailes.tsx`, `ClientStep2ID.tsx`, `ClientStep3Devices.tsx`, `ClientStep4Contract.tsx`, `ClientStepSuccess.tsx`) и вспомогательная модалка устройств.
- `README.md` — актуальные инструкции по запуску.

Документ обновляйте при изменении структуры файлов или бизнес-потока.
