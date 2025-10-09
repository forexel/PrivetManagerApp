import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { useNavigate } from 'react-router-dom'
import '../../styles/tickets.css'

type TicketListItem = {
  id: string
  title: string
  status: 'new' | 'in_progress' | 'completed' | 'reject'
  created_at: string
  updated_at?: string
}

const statusLabel: Record<TicketListItem['status'], string> = {
  new: 'New',
  in_progress: 'In progress',   // или 'In progress'
  completed: 'Done',
  reject: 'Rejected',
}

const toUiStatus = (raw: string) =>
  (raw ?? 'new').replace(/\s+/g, '_').toLowerCase() as TicketListItem['status'];

export function TicketsListPage() {
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'my'],
    queryFn: () => api.get<TicketListItem[]>('/tickets/'),
    retry: false,
  })

  return (
    <div className="dashboard">
      <h1>Вызов Мастера</h1>

      {isLoading && (
        <div className="empty-state">
          <div className="empty-box">Загрузка…</div>
        </div>
      )}

      {!isLoading && error && (
        <div className="empty-state">
          <div className="empty-box">
            <div className="empty-title" style={{ color: 'red' }}>Ошибка</div>
            <div className="empty-text">{(error as any)?.message ?? 'Неизвестная ошибка'}</div>
          </div>
        </div>
      )}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <div className="empty-state">
          <div className="empty-box">
            <div className="empty-title">Пока тут пусто</div>
            <div className="empty-text">Вы пока не вызывали мастера</div>
          </div>
        </div>
      )}

      {!isLoading && !error && (data ?? []).length > 0 && (
        <ul className="req-list">
          {(data ?? []).map((t) => {
            const when = new Date((t as any).updated_at ?? t.created_at).toLocaleString('ru-RU', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
            const uiStatus = toUiStatus((t as any).status);
            return (
              <li
                key={t.id}
                className="req-item"
                onClick={() => navigate(`/tickets/${t.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/tickets/${t.id}`) }}
                style={{ cursor: 'pointer' }}
              >
                <div className="req-avatar" />
                <div>
                  <div className="req-title-row">
                    <div className="req-title">{t.title}</div>
                    <span className={`req-badge st-${uiStatus}`}>{statusLabel[uiStatus]}</span>
                  </div>
                  <div className="req-meta">{when}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="req-fab">
        <button className="btn-fab" onClick={() => navigate('/tickets/new')}>Вызвать</button>
      </div>
    </div>
  )
}

export default TicketsListPage
