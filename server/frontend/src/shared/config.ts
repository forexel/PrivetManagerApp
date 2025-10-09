export const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || 'dev'
export const APP_CHANNEL = ((import.meta.env.VITE_APP_CHANNEL as string) || 'web') as 'web' | 'pwa' | 'apk' | 'ipa'
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://127.0.0.1:8000'

