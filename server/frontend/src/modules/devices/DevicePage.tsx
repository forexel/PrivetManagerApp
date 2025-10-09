import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'

type Device = {
  id: string
  user_id: string
  title: string
  brand?: string
  model?: string
  serial_number?: string
  purchase_date?: string
  warranty_until?: string
  created_at: string
  updated_at: string
}

export function DevicePage() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['device', id],
    queryFn: () => api.get<Device>(`/devices/${id}`),
    enabled: !!id,
    retry: false,
  })

  if (isLoading) return <p>Loading...</p>
  if (error) return <p style={{ color: 'red' }}>Ошибка: {(error as any).message}</p>
  if (!data) return <p>Not found</p>

  return (
    <>
      <h2>{data.title}</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </>
  )
}
