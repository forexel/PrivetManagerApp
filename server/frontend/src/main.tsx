import ReactDOM from 'react-dom/client'
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import { LoginPage } from './modules/auth/LoginPage'
import { RegisterPage } from './modules/auth/RegisterPage'
import { DevicePage } from './modules/devices/DevicePage'
import TicketsListPage from './modules/tickets/TicketsListPage'
import { TicketCreatePage } from './modules/tickets/TicketCreatePage'
import TicketSuccessPage from './modules/tickets/TicketSuccessPage'
import TicketDetailPage from './modules/tickets/TicketDetailPage'
import { HomePage } from './modules/home/HomePage'
import { ForgotPasswordPage } from './modules/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './modules/auth/ResetPasswordPage'
import ForgotPasswordSuccessPage from './modules/auth/ForgotPasswordSuccessPage'
import { RequireAuth } from './shared/auth/RequireAuth'
import SupportListPages from './modules/support/SupportListPages'
import SupportDetailPage from './modules/support/SupportDetailPage'
import SupportCreatePage from './modules/support/SupportCreatePage'
import SupportSuccessPage from './modules/support/SupportSuccessPage'
import { ProfilePage } from './modules/profile/ProfilePage'
import ProfileDeletePage from './modules/profile/ProfileDeletePage'
import { DevicesListPage } from './modules/devices/DevicesListPage'
import './index.css'
import './styles/style.css'
import './styles/forms.css'
import './styles/dashboard.css'
import SubscriptionPage from './modules/home/SubscriptionPage'
import SubscriptionSuccess from './modules/home/SubscritionSuccsess'
import SubscriptionDenied from './modules/home/SubscritionDenied'

// PWA: регистрируем SW только в production, чтобы не ломать dev
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const ver = (import.meta.env as any).VITE_APP_VERSION || (import.meta.env as any).VITE_GIT_SHA || ''
    const swUrl = `/sw.js${ver ? `?v=${encodeURIComponent(ver)}` : ''}`
    navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' as any }).then((reg) => {
      // Попросим браузер проверить обновление сразу
      try { reg.update() } catch {}
      // Авто-обновление вкладки после активации нового SW
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Перезагрузим один раз
        if (!(window as any).__swReloader) {
          (window as any).__swReloader = true
          location.reload()
        }
      })
    }).catch(() => {})
  })
}

// В dev удаляем ранее установленные SW, чтобы не было застрявшего кэша
if (!import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}))
  }).catch(() => {})
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset', element: <ResetPasswordPage /> },
  { path: '/forgot-password/success', element: <ForgotPasswordSuccessPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <App />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'devices', element: <DevicesListPage /> }, // или <DeviceListPage />
      { path: 'devices/:id', element: <DevicePage /> },
      { path: 'tickets', element: <TicketsListPage /> },              // список заявок
      { path: 'tickets/new', element: <TicketCreatePage /> },     // форма (фулл-скрин)
      { path: 'tickets/success', element: <TicketSuccessPage />}, // успех (фулл-скрин)
      { path: 'tickets/:id', element: <TicketDetailPage /> },     // подробности + чат
      { path: 'subscriptions', element: <SubscriptionPage /> },
      { path: 'subscriptions/success', element: <SubscriptionSuccess /> },
      { path: 'subscriptions/denied', element: <SubscriptionDenied /> },
      { path: 'support', element: <SupportListPages /> },         // список «Мои обращения»
      { path: 'support/new', element: <SupportCreatePage /> },   // создать обращение
      { path: 'support/success', element: <SupportSuccessPage /> }, // успех
      { path: 'support/:id', element: <SupportDetailPage /> },   // подробности
      { path: 'profile', element: <ProfilePage /> }, 
      { path: 'profile/delete', element: <ProfileDeletePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

const qc = new QueryClient()

// Runtime учёт нижней системной панели (например, Galaxy Fold)
function applyViewportInsets() {
  const vv: any = (window as any).visualViewport
  const ih = window.innerHeight || 0
  const vh = vv?.height || ih
  const off = vv?.offsetTop || 0
  // нижняя панель/клавиатура/жестовая подсказка
  const bottomInset = Math.max(0, Math.round(ih - vh - off))
  document.documentElement.style.setProperty('--vvb', bottomInset + 'px')
}
applyViewportInsets()
window.addEventListener('resize', applyViewportInsets)
;(window as any).visualViewport?.addEventListener?.('resize', applyViewportInsets)
;(window as any).visualViewport?.addEventListener?.('scroll', applyViewportInsets)
window.addEventListener('orientationchange', () => setTimeout(applyViewportInsets, 50))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
