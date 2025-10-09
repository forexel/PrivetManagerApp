#!/usr/bin/env bash
set -euo pipefail

# PrivetSuperApp — macOS bootstrap installer
# Installs: Homebrew (if missing), Docker (Desktop by default or Colima via flag),
# Python 3.12, Node.js (LTS), Git. Then suggests next steps.
#
# Usage:
#   bash scripts/install.sh                 # Docker Desktop (default)
#   bash scripts/install.sh --with-colima   # Use Colima instead of Docker Desktop
#   bash scripts/install.sh --no-docker     # Skip Docker entirely
#
# Idempotent: safe to re-run.

WITH_COLIMA=false
SKIP_DOCKER=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-colima)
      WITH_COLIMA=true
      shift
      ;;
    --no-docker)
      SKIP_DOCKER=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

log()  { printf "\033[1;34m[info]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ ok ]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[err ]\033[0m %s\n" "$*"; }

# ---------- Homebrew ----------
if ! command -v brew >/dev/null 2>&1; then
  log "Installing Homebrew…"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # shellcheck disable=SC2016
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "Homebrew installed"
else
  ok "Homebrew already installed"
  eval "$(/opt/homebrew/bin/brew shellenv)" || true
fi

# ---------- Core dev tools ----------
log "Installing Git…"
brew list git >/dev/null 2>&1 || brew install git
ok "Git ready: $(git --version)"

log "Installing Python 3.12…"
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
PYBIN=$(brew --prefix)/opt/python@3.12/bin/python3
PIBIN=$(brew --prefix)/opt/python@3.12/bin/pip3
ok "Python: $($PYBIN -V)"

log "Upgrading pip/setuptools/wheel…"
$PYBIN -m pip install --upgrade pip setuptools wheel || true

log "Installing Node.js (LTS)…"
brew list node >/dev/null 2>&1 || brew install node
ok "Node: $(node -v), npm: $(npm -v)"

# ---------- Docker (Desktop or Colima) ----------
if [ "$SKIP_DOCKER" = false ]; then
  if [ "$WITH_COLIMA" = true ]; then
    log "Installing Colima + docker client…"
    brew list colima >/dev/null 2>&1 || brew install colima
    brew list docker >/dev/null 2>&1 || brew install docker
    if ! colima status >/dev/null 2>&1; then
      log "Starting Colima (default runtime)…"
      colima start
    fi
    ok "Colima running."
    if ! docker version >/dev/null 2>&1; then
      warn "Docker client installed, but daemon not detected. Ensure colima is running: 'colima start'"
    else
      ok "Docker CLI ready: $(docker --version)"
    fi
  else
    log "Installing Docker Desktop…"
    brew list --cask docker >/dev/null 2>&1 || brew install --cask docker
    open -a Docker || true
    warn "If Docker Desktop prompts for permissions, accept and wait until it's Running."
    # Poll for readiness (60s)
    for i in {1..60}; do
      if docker version >/dev/null 2>&1; then ok "Docker is running"; break; fi
      sleep 1
      if [ "$i" -eq 60 ]; then warn "Docker not ready yet. Open Docker app and wait for 'Running'."; fi
    done
  fi
else
  warn "Skipping Docker installation (--no-docker)."
fi

# ---------- Project scaffold helpers ----------
if [ -f "scripts/scaffold.sh" ]; then
  log "Scaffold script found: scripts/scaffold.sh"
else
  warn "scripts/scaffold.sh not found. You can generate it manually or pull latest repo changes."
fi

# ---------- Final hints ----------
cat << 'HINTS'

✅ Installation finished.

Next steps:
  1) If using Docker Desktop:
       - Ensure Docker whale icon says "Running".
     If using Colima:
       - 'colima start' (if not already running).

  2) From repo root, create env file:
       cp .env.example .env

  3) Start infrastructure (Postgres + MinIO):
       docker compose -f docker/docker-compose.yml up -d

  4) Backend (dev):
       cd server
       $(brew --prefix)/opt/python@3.12/bin/python3 -m venv .venv
       source .venv/bin/activate
       python -m pip install --upgrade pip
       python -m pip install -r <(cat <<REQ
fastapi
uvicorn[standard]
sqlalchemy>=2.0
psycopg[binary]
alembic
pydantic[email]>=2.0
python-multipart
passlib[argon2]
boto3
REQ
)
       uvicorn app.main:app --reload

  5) Frontend (dev):
       bash scripts/bootstrap_client.sh
       cd client && npm run dev

HINTS

ok "All set."
