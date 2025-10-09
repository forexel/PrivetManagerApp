type HttpError = Error & { status?: number }

// Base URL for API requests
const BASE: string = (
  (import.meta.env as any).VITE_API_BASE ||
  (import.meta.env as any).VITE_API_BASE_URL ||
  '/api/v1'
)

function joinUrl(input: string): string {
  // Absolute http(s) URLs — use as is
  if (/^https?:\/\//i.test(input)) return input
  const base = String(BASE || '').replace(/\/$/, '')
  let path = String(input || '')
  // Remove leading slashes
  path = path.replace(/^\/+/, '')
  // If consumer passed '/api/v1/...', strip the prefix to avoid double base
  path = path.replace(/^api\/v1\/?/, '')
  path = path.replace(/^v1\/?/, '')
  return `${base}/${path}`
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) return false
    const r = await fetch(joinUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!r.ok) return false
    const data: any = await r.json()
    if (data?.access_token) localStorage.setItem('access_token', data.access_token)
    if (data?.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
    return !!data?.access_token
  } catch {
    return false
  }
}

async function request<T>(url: string, init?: RequestInit, _retried = false): Promise<T> {
  const token = localStorage.getItem('access_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const finalUrl = joinUrl(url)
  const res = await fetch(finalUrl, { ...init, headers: { ...headers, ...(init?.headers as any) } })
  if (res.status === 401 && !_retried) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      return request<T>(url, init, true)
    }
    // refresh не удался — очищаем токены и уводим на /login
    try { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token') } catch {}
    if (typeof window !== 'undefined') {
      window.location.replace('/login')
    }
  }
  if (!res.ok) {
    const err: HttpError = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: any) => request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put:  <T>(url: string, body?: any) => request<T>(url, { method: 'PUT',  body: JSON.stringify(body ?? {}) }),
  del:  <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}
