import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'           // ← добавь

export default defineConfig({
  plugins: [svgr(), react()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api/manager': {
        target: 'http://localhost:8200',
        changeOrigin: true,
      },
    },
  },
})
