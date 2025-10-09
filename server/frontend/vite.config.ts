import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [
    react(),
    svgr(), // <— ДОБАВИТЬ
  ],
  base: '/',   // говорим vite: все ассеты должны ссылаться относительно /web/
})