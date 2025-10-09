#!/usr/bin/env bash
set -euo pipefail

# Bootstrap React + Vite + TS client
# Usage: bash scripts/bootstrap_client.sh

ROOT_DIR=$(pwd)
CLIENT_DIR="$ROOT_DIR/client"

# 1) Scaffold Vite app if package.json is missing
if [ ! -f "$CLIENT_DIR/package.json" ]; then
  echo "[info] Scaffolding Vite React TS app in ./client"
  rm -rf "$CLIENT_DIR" 2>/dev/null || true
  npm create vite@latest client -- --template react-ts
fi

# 2) Install deps
cd "$CLIENT_DIR"
if [ ! -d node_modules ]; then
  echo "[info] Installing npm dependencies"
  npm i
fi

# 3) App libs
npm i axios @tanstack/react-query react-router-dom zod react-hook-form --save

# 4) Create scaffolding files if missing
mkdir -p src/{app,shared/api} || true

if [ ! -f src/shared/api/http.ts ]; then
  cat > src/shared/api/http.ts << 'JS'
import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000' });
api.interceptors.request.use((config) => {
  // TODO: attach access token
  return config;
});
export default api;
JS
fi

if [ ! -f src/app/queryClient.ts ]; then
  cat > src/app/queryClient.ts << 'JS'
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient();
JS
fi

if [ ! -f src/app/router.tsx ]; then
  cat > src/app/router.tsx << 'JSX'
import { createBrowserRouter } from 'react-router-dom';
export const router = createBrowserRouter([
  { path: '/', element: <div>Home</div> },
]);
JSX
fi

echo "[ok] Client scaffold complete. Run: 
  cd client && npm run dev"
