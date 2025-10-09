import { useMemo } from 'react'
import { useAuth } from './auth-context'
import { createApiClient } from './api-client'

export function useApi() {
  const { token } = useAuth()
  return useMemo(() => createApiClient(token), [token])
}
