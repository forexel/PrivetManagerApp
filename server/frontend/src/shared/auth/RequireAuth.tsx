import React from 'react'
import { Navigate } from 'react-router-dom'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}