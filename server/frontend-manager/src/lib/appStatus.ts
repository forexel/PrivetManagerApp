export type AppStatus = 'offline' | 'server' | null

type Listener = (status: AppStatus) => void

let currentStatus: AppStatus = null
const listeners = new Set<Listener>()

export function setAppStatus(status: AppStatus) {
  if (currentStatus === status) return
  currentStatus = status
  listeners.forEach((listener) => listener(currentStatus))
}

export function clearAppStatus() {
  setAppStatus(null)
}

export function subscribeAppStatus(listener: Listener) {
  listeners.add(listener)
  listener(currentStatus)
  return () => listeners.delete(listener)
}
