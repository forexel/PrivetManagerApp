const STORAGE_KEY = 'master_access_token'

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setAccessToken(token: string) {
  window.localStorage.setItem(STORAGE_KEY, token)
}

export function clearAccessToken() {
  window.localStorage.removeItem(STORAGE_KEY)
}
