# Структура репозитория

```
PrivetManagerApp/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── FILE_STRUCTURE.md
│   └── REQUIREMENTS.md
├── server/
│   ├── app/
│   │   ├── core/
│   │   ├── manager_api/
│   │   ├── models/
│   │   └── main.py
│   ├── alembic/
│   │   └── versions/
│   ├── frontend-manager/
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── requirements.txt
│   └── pyproject.toml
└── deploy/
    └── Caddyfile (пример конфигурации для manager.privetsuper.ru)
```

> Таблицы `users` и `devices` остаются из исходного проекта, новые сущности добавляются в `manager_*`.
