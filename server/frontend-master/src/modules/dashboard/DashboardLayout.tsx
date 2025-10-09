import { PropsWithChildren } from 'react'
import { useAuth } from '../../lib/auth-context'

function DashboardLayout({ children }: PropsWithChildren) {
  const { logout } = useAuth()

  return (
    <div className="layout">
      <header className="layout__header">
        <div>
          <h1 className="layout__title">Privet Master Portal</h1>
          <p className="layout__subtitle">Управление клиентами и оформлением договоров</p>
        </div>
        <button className="layout__logout" type="button" onClick={logout}>
          Выйти
        </button>
      </header>
      <main className="layout__main">{children}</main>
    </div>
  )
}

export default DashboardLayout
