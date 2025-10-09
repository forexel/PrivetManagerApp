import { useCallback, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { clearAccessToken, getAccessToken, setAccessToken } from './lib/auth'
import { AuthProvider } from './lib/auth-context'
import LoginPage from './modules/auth/LoginPage'
import DashboardLayout from './modules/dashboard/DashboardLayout'
import ClientsPage from './modules/clients/ClientsPage'
import ClientDetailPage from './modules/clients/ClientDetailPage'

function App() {
  const [token, setToken] = useState<string | null>(() => getAccessToken())

  const handleLoginSuccess = (accessToken: string) => {
    setAccessToken(accessToken)
    setToken(accessToken)
  }

  const handleLogout = useCallback(() => {
    clearAccessToken()
    setToken(null)
  }, [])

  if (!token) {
    return <LoginPage onSuccess={handleLoginSuccess} />
  }

  const authValue = useMemo(() => ({ token, logout: handleLogout }), [token, handleLogout])

  return (
    <AuthProvider value={authValue}>
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/clients?tab=new" replace />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:clientId" element={<ClientDetailPage />} />
            <Route path="*" element={<Navigate to="/clients?tab=new" replace />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
