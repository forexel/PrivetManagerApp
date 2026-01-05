import { useEffect, useState } from 'react'
import { clearAppStatus, setAppStatus, subscribeAppStatus } from './appStatus'
import type { AppStatus } from './appStatus'
import '../styles/app-status.css'

const copy: Record<Exclude<AppStatus, null>, { title: string; text: string }> = {
  offline: {
    title: 'Нет доступа к интернету',
    text: 'Подключитесь к сети для обмена данными.',
  },
  server: {
    title: 'Ведутся технические работы',
    text: 'Попробуйте повторить через час.',
  },
}

export function AppStatusOverlay() {
  const [status, setStatus] = useState<AppStatus>(null)

  useEffect(() => {
    const unsubscribe = subscribeAppStatus(setStatus)
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const onOffline = () => setAppStatus('offline')
    const onOnline = () => clearAppStatus()
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setAppStatus('offline')
    }
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  if (!status) return null
  const content = copy[status]
  return (
    <div className="app-status-overlay" role="alert">
      <div className="page-blue app-status-screen">
        <div className="card auth-card">
          <h1 className="card-title">{content.title}</h1>
          <p className="success-text">{content.text}</p>
          <div className="success-actions">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Обновить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
