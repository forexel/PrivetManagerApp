#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/scaffold.sh

# Create folders
mkdir -p server/app/{core,db/{migrations},models,schemas,repositories,services,api/{v1},utils} \
         client \
         docker

# Root env example
cat > .env.example << 'EOF'
# ===== Backend =====
DATABASE_URL=postgresql+psycopg://privet:privet@localhost:5432/privetdb
JWT_SECRET=change_me
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=privet-bucket

# ===== Frontend =====
VITE_API_BASE_URL=http://localhost:8000
EOF

# docker-compose
cat > docker/docker-compose.yml << 'EOF'
version: "3.9"
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: privet
      POSTGRES_PASSWORD: privet
      POSTGRES_DB: privetdb
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
volumes:
  db_data:
  minio_data:
EOF

# server/pyproject.toml (uv/poetry-agnostic; works with pip as well)
cat > server/pyproject.toml << 'EOF'
[project]
name = "privet-superapp-server"
version = "0.1.0"
description = "FastAPI backend for PrivetSuperApp"
requires-python = ">=3.10"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "sqlalchemy>=2.0",
  "psycopg[binary]",
  "alembic",
  "pydantic[email]>=2.0",
  "python-multipart",
  "passlib[argon2]",
  "boto3",
]

[tool.uv]
# allows `uv run` if you use uv, otherwise ignore
EOF

# server/alembic.ini
cat > server/alembic.ini << 'EOF'
[alembic]
script_location = app/db/migrations
sqlalchemy.url = %(DATABASE_URL)s
file_template = %%((rev)s)_%%(slug)s

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
EOF

# server/app/main.py
cat > server/app/main.py << 'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PrivetSuperApp API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}
EOF

# server/app/core/config.py
cat > server/app/core/config.py << 'EOF'
from pydantic import BaseSettings, AnyUrl

class Settings(BaseSettings):
    DATABASE_URL: AnyUrl = "postgresql+psycopg://privet:privet@localhost:5432/privetdb"
    JWT_SECRET: str = "change_me"
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "privet-bucket"

    class Config:
        env_file = ".env"

settings = Settings()
EOF

# server/app/db/base.py
cat > server/app/db/base.py << 'EOF'
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
EOF

# server/app/db/session.py
cat > server/app/db/session.py << 'EOF'
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
EOF

# server/app/api/v1/router.py
cat > server/app/api/v1/router.py << 'EOF'
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

@router.get("/ping")
def ping():
    return {"pong": True}
EOF

# Wire router in main.py (append import and include_router)
python3 - << 'PY'
from pathlib import Path
p = Path('server/app/main.py')
s = p.read_text()
if 'include_router' not in s:
    s = s + "\nfrom app.api.v1.router import router as api_v1\napp.include_router(api_v1)\n"
    p.write_text(s)
print("Patched main.py to include API router")
PY

# client bootstrap helper (will scaffold with Vite when you run it manually)
cat > scripts/bootstrap_client.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Requires: node >= 18

if [ ! -d client ]; then
  npm create vite@latest client -- --template react-ts
fi
cd client
npm i
npm i axios @tanstack/react-query react-router-dom zod react-hook-form

# Create basic http.ts and router scaffolding
mkdir -p src/{app,shared/api}
cat > src/shared/api/http.ts << 'JS'
import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000' });
api.interceptors.request.use((config) => {
  // TODO: attach access token
  return config;
});
export default api;
JS

cat > src/app/router.tsx << 'JSX'
import { createBrowserRouter } from 'react-router-dom';
export const router = createBrowserRouter([
  { path: '/', element: <div>Home</div> },
]);
JSX

cat > src/app/queryClient.ts << 'JS'
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient();
JS

echo "Client scaffold complete."
EOF
chmod +x scripts/bootstrap_client.sh

chmod +x scripts/scaffold.sh

echo "Scaffold complete. Next steps:\n1) docker compose -f docker/docker-compose.yml up -d\n2) cd server && uvicorn app.main:app --reload\n3) bash scripts/bootstrap_client.sh (requires Node)\n"

---

# Makefile (optional)

If you want `make` shortcuts, create a `Makefile` with:

```
.PHONY: up down api client
up:
	docker compose -f docker/docker-compose.yml up -d

e2e:
	# placeholder for e2e tests

api:
	cd server && uvicorn app.main:app --reload

client:
	bash scripts/bootstrap_client.sh && cd client && npm run dev
```
