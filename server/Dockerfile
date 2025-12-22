# ---- Frontend build (Privet Manager) ----
FROM node:20-bullseye AS frontend-build
WORKDIR /app/frontend

RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# install deps with resilient npm config (lockfile-aware)
COPY frontend-manager/package.json frontend-manager/package-lock.json ./
# Harden npm against flaky networks
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN --mount=type=cache,target=/root/.npm \
    set -eux; \
    npm config set registry "${NPM_REGISTRY}"; \
    npm config set fetch-retries 12; \
    npm config set fetch-retry-factor 2; \
    npm config set fetch-retry-mintimeout 20000; \
    npm config set fetch-timeout 1200000; \
    npm config set audit false; \
    npm config set fund false; \
    npm config set prefer-offline true; \
    success=0; \
    for i in 1 2 3 4 5; do \
      if npm ci --no-audit --no-fund --legacy-peer-deps; then success=1; break; fi; \
      echo "npm ci failed ($i), retrying..." >&2; \
      sleep $((10*i)); \
    done; \
    if [ "$success" -ne 1 ]; then \
      echo "npm ci did not succeed, falling back to npm install --legacy-peer-deps" >&2; \
      npm install --no-audit --no-fund --legacy-peer-deps; \
    fi; \
    (npm install --no-save @rollup/rollup-linux-arm64-gnu@4.52.4 || true); \
    (npm rebuild esbuild --force || true); \
    npm cache verify || true

# build
COPY frontend-manager ./
RUN npm run build

# ---- Backend (Privet Manager) ----
FROM python:3.12-slim AS backend
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq-dev curl fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY pyproject.toml ./

# static frontend from previous stage (note target path differs)
COPY --from=frontend-build /app/frontend/dist /app/frontend-manager/dist

ENV UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=8000
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
