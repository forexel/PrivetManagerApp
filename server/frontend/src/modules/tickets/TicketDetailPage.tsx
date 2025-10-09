import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import '../../styles/tickets.css'

type HistoryItem = { status: 'new'|'in_progress'|'completed'|'reject'; at: string }
type TicketDetail = {
  id: string
  title: string
  description?: string | null
  created_at: string
  updated_at?: string | null
  status: 'new'|'in_progress'|'completed'|'reject'
  status_history: HistoryItem[]
}

const statusLabels: Record<HistoryItem['status'], string> = {
  new: 'New',
  in_progress: 'In progress', // или 'Pending' если так надо
  completed: 'Done',
  reject: 'Rejected',
}

function formatDate(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api.get<TicketDetail>(`/tickets/${id}`),
    enabled: !!id,
  })

  if (isLoading) return <div className="page-blue"><div className="card auth-card">Загрузка…</div></div>
  if (isError || !data) return <div className="page-blue"><div className="card auth-card">Не удалось загрузить заявку</div></div>

  const updated = data.updated_at ?? data.created_at

  return (
    <div className="page-white">
      <div className="ticket-detail page-content">
        <div className="page-header">
          <button className="back-btn" aria-label="Назад" onClick={() => window.location.assign('/tickets')}>
            ←
          </button>
          <h2 className="page-title">Вызов мастера</h2>
        </div>

        {/* Короткое описание проблемы + актуальный статус */}
        <div className="detail-title-row">
          <div className="detail-title">{data.title}</div>
          <span className={`status-badge status-${data.status}`}>{statusLabels[data.status]}</span>
        </div>
        <div className="detail-updated">обновлено {formatDate(updated)}</div>

        {/* Подробное описание */}
        {data.description ? (
          <div className="detail-section">
            <div className="detail-desc">{data.description}</div>
          </div>
        ) : null}

        <hr className="detail-sep" />

        {/* История статусов / сообщения мастера */}
        <div className="detail-section">
          <div className="detail-section-title">История</div>
          <ul className="history">
            {data.status_history.map((h, i) => (
              <li className="history-item" key={`${h.status}-${h.at}-${i}`}>
                <span className={`status-badge status-${h.status}`}>{statusLabels[h.status]}</span>
                <span className="history-date">{formatDate(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
