import { useCallback, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { clearAccessToken, getAccessToken, setAccessToken } from './lib/auth'
import { AuthProvider } from './lib/auth-context'
import LoginPage from './modules/auth/LoginPage'
import DashboardLayout from './modules/dashboard/DashboardLayout'
import ClientsPage from './modules/clients/ClientsPage'
import ClientStep1 from './modules/clients/ClientStep1Detailes'
import ClientStep2ID from './modules/clients/ClientStep2ID'
import ClientStep3Devices from './modules/clients/ClientStep3Devices'
import ClientStep4Contract from './modules/clients/ClientStep4Contract'
import ClientStepSuccess from './modules/clients/ClientStepSuccess'
import ClientStep3AddDevice from './modules/clients/ClientStep3AddDevice'
import ClientStep3DeviceDetail from './modules/clients/ClientStep3DeviceDetail'

function App() {
  const [token, setToken] = useState<string | null>(() => getAccessToken())

  const handleLoginSuccess = (accessToken: string) => {
    setAccessToken(accessToken)
    setToken(accessToken)
  }

  const handleLogout = useCallback(() => {
    clearAccessToken()
    setToken(null)
    // Force a full reload to reset router/query state and avoid blank screen
    window.location.replace('/')
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
            <Route path="/clients/:clientId" element={<ClientStep1 />} />
            <Route path="/clients/:clientId/step/1" element={<ClientStep1 />} />
            <Route path="/clients/:clientId/step/2" element={<ClientStep2ID />} />
            <Route path="/clients/:clientId/step/3/device/:deviceId" element={<ClientStep3DeviceDetail />} />
            <Route path="/clients/:clientId/step/3/add" element={<ClientStep3AddDevice />} />
            <Route path="/clients/:clientId/step/3" element={<ClientStep3Devices />} />
            <Route path="/clients/:clientId/step/4" element={<ClientStep4Contract />} />
            <Route path="/clients/:clientId/step/success" element={<ClientStepSuccess />} />
            <Route path="*" element={<Navigate to="/clients?tab=new" replace />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
