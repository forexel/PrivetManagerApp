import { PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'

function DashboardLayout({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const showNav = pathname === '/clients'
  return (
    <div className={`app${showNav ? '' : ' app--no-nav app--blue'}`}>
      <div className="app-content">
        <main className="layout__main">{children}</main>
      </div>
    </div>
  )
}

export default DashboardLayout
