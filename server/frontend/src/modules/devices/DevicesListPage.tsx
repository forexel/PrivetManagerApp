import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../shared/api'
import '../../styles/dashboard.css'

type DeviceListItem = { id: string; title: string }

export function DevicesListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['devices', 'list'],
    queryFn: () => api.get<DeviceListItem[]>('/devices/search'),
    retry: false,
  })

  return (
    <div className="dashboard">
      <h1>Моя техника</h1>

      {isLoading && (
        <div className="empty-state">
          <div className="empty-box">Загрузка…</div>
        </div>
      )}

      {!isLoading && error && (
        <div className="empty-state">
          <div className="empty-box">
            <div className="empty-title" style={{ color: 'red' }}>Ошибка</div>
            <div className="empty-text">{(error as any).message}</div>
          </div>
        </div>
      )}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <div className="empty-state">
          <div className="empty-box">
            <div className="empty-title">Пока тут пусто</div>
            <div className="empty-text">
              Тут появятся ваши устройства, когда их зарегистрируем
            </div>
          </div>
        </div>
      )}

      {!isLoading && !error && (data ?? []).length > 0 && (
        <ul style={{ padding: 0, margin: '8px 0 0' }}>
          {(data ?? []).map((d) => (
            <li key={d.id} style={{ listStyle: 'none', marginBottom: 8 }}>
              <Link to={`/devices/${d.id}`}>{d.title} ({d.id})</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
