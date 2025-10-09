# Структура репозитория

```
PrivetMasterApp/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── FILE_STRUCTURE.md
│   └── REQUIREMENTS.md
├── server/
│   ├── app/
│   │   ├── core/
│   │   ├── master_api/
│   │   ├── models/
│   │   └── main.py
│   ├── alembic/
│   │   └── versions/
│   ├── frontend-master/
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── requirements.txt
│   └── pyproject.toml
└── deploy/
    └── Caddyfile (пример конфигурации для master.privetsuper.ru)
```

> Таблицы `users` и `devices` остаются из исходного проекта, новые сущности добавляются в `master_*`.
