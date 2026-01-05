import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AppStatusOverlay } from './lib/AppStatusOverlay'

import './styles/style.css'
import './styles/forms.css'
import './styles/dashboard.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppStatusOverlay />
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
