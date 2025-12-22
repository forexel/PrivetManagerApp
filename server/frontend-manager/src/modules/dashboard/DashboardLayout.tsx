import { PropsWithChildren } from 'react'

function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <div className="app">
      <div className="app-content">
        <main className="layout__main">{children}</main>
      </div>
    </div>
  )
}

export default DashboardLayout
