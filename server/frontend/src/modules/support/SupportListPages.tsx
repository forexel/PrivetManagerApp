import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import '../../styles/tickets.css'

type SupportItem = {
  id: string
  subject: string
  status: 'new' | 'in_progress' | 'completed' | 'reject' | 'open' | 'pending' | 'closed' | 'rejected'
  created_at: string
  updated_at?: string
}

const statusLabel: Record<'new'|'in_progress'|'completed'|'reject', string> = {
  new: 'New',
  in_progress: 'In progress',
  completed: 'Done',
  reject: 'Rejected',
}

const toUiStatus = (raw: SupportItem['status']): 'new'|'in_progress'|'completed'|'reject' => {
  switch (raw) {
    case 'open': return 'new'
    case 'pending': return 'in_progress'
    case 'closed': return 'completed'
    case 'rejected': return 'reject'
    default: return (raw as any) as 'new'|'in_progress'|'completed'|'reject'
  }
}

export function SupportListPage() {

  const { data, isLoading, error } = useQuery({
    queryKey: ['support', 'my'],
    queryFn: () => api.get<SupportItem[]>('/support/'),
    retry: false,
  })

  const items = data ?? []

  return (
    <div className="dashboard">
      <h1>Мои обращения</h1>

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

      {!isLoading && !error && items.length === 0 && (
        <div className="empty-state">
          <div className="empty-box">
            <div className="empty-title">Пока тут пусто</div>
            <div className="empty-text">У вас ещё нет обращений в поддержку</div>
          </div>
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <ul className="req-list">
          {items.map((t) => {
            const when = new Date((t.updated_at ?? t.created_at)).toLocaleString('ru-RU', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
            return (
              <li
                key={t.id}
                className="req-item"
                onClick={() => (window.location.href = `/support/${t.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (window.location.href = `/support/${t.id}`) }}
                style={{ cursor: 'pointer' }}
              >
                <div className="req-avatar" />
                <div>
                  <div className="req-title-row">
                    <div className="req-title">{t.subject}</div>
                    {(() => { const ui = toUiStatus(t.status); return (
                      <span className={`req-badge st-${ui}`}>{statusLabel[ui]}</span>
                    )})()}
                  </div>
                  <div className="req-meta">{when}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="req-fab">
        <a className="btn-fab" href="/support/new">Написать</a>
      </div>
    </div>
  )
}

export default SupportListPage
