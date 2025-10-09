import axios from 'axios'

const baseURL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://127.0.0.1:8000'

export const api = axios.create({ baseURL })

api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers = config.headers || {}
      if (!config.headers['Authorization']) {
        (config.headers as any).Authorization = `Bearer ${token}`
      }
    }
  } catch {}
  return config
})