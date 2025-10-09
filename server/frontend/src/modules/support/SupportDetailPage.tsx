import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api'
import '../../styles/tickets.css'
import '../../styles/forms.css'

type SupportTicketOut = {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'closed' | 'rejected' | 'new' | 'pending' | 'completed' | 'reject';
  created_at: string;
};

type SupportMessageOut = {
  id: string;
  ticket_id: string;
  author: 'user' | 'support';
  body: string;
  created_at: string;
};

export default function SupportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')

  // Все хуки — без условий, порядок стабилен
  const ticketQ = useQuery({
    queryKey: ['support', id],
    enabled: !!id,
    queryFn: () => api.get<SupportTicketOut>(`/support/${id}`),
    retry: false,
  })

  const msgsQ = useQuery({
    queryKey: ['support', id, 'messages'],
    enabled: !!id,
    queryFn: () => api.get<SupportMessageOut[]>(`/support/${id}/messages`),
    retry: false,
  })

  const t = ticketQ.data as SupportTicketOut | undefined
  const messages = msgsQ.data ?? []

  const ui = useMemo(() => {
    const toUiStatus = (raw: SupportTicketOut['status']): 'new'|'in_progress'|'completed'|'reject' => {
      switch (raw) {
        case 'open': return 'new'
        case 'pending': return 'in_progress'
        case 'closed': return 'completed'
        case 'rejected': return 'reject'
        default: return (raw as any)
      }
    }
    const labels: Record<'new'|'in_progress'|'completed'|'reject', string> = {
      new: 'New', in_progress: 'In progress', completed: 'Done', reject: 'Rejected'
    }
    return { toUiStatus, labels }
  }, [])

  const sendMutation = useMutation({
    mutationFn: async () => {
      setErr('')
      await api.post(`/support/${id}/messages/user`, { body })
    },
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: ['support', id, 'messages'] })
    },
    onError: () => setErr('Не удалось отправить сообщение')
  })

  // Auto-grow textarea (1–4 lines) + button height sync
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const inputWrapRef = useRef<HTMLDivElement | null>(null)
  const [taH, setTaH] = useState<number>(40)
  const measureChat = () => {
    const h = inputWrapRef.current?.offsetHeight ?? 0
    // прокинем паддинг под фиксированный инпут
    if (pageRef.current) pageRef.current.style.setProperty('--chat-pad', h + 'px')
  }
  const autoSize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxH = Math.max(Math.floor(window.innerHeight * 0.4), 120) // до 40% высоты
    const next = Math.min(Math.max(el.scrollHeight, 40), maxH)
    el.style.height = next + 'px'
    setTaH(next)
    measureChat()
  }
  useEffect(() => { autoSize(); measureChat() }, [])
  useEffect(() => { autoSize() }, [body])
  useEffect(() => {
    const onResize = () => { measureChat() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Прокрутка к последнему сообщению
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const scrollToEnd = () => {
    // 1) попробуем классическим способом
    listEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
    // 2) если родительский скролл — это .app-content, дёрнем его явно
    const scroller = document.querySelector('.app-content') as HTMLElement | null
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' })
  }
  useEffect(() => {
    // даём макету дорендериться (авто-рост textarea/измерение paddings)
    const id = setTimeout(scrollToEnd, 0)
    return () => clearTimeout(id)
  }, [messages.length])

  // Отрисовываем понятные состояния без риска нарушить порядок хуков
  if (!id || ticketQ.isLoading) {
    return <div className="page-white"><div className="dashboard"><p>Загрузка…</p></div></div>
  }
  if (ticketQ.isError || !t) {
    return (
      <div className="page-white">
        <div className="dashboard">
          <p>Не удалось загрузить обращение.</p>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>Назад</button>
        </div>
      </div>
    )
  }

  const statusKey = ui.toUiStatus(t.status)

  return (
    <div className="page-white">
      <div ref={pageRef} className="ticket-detail page-content">
        <div className="page-header">
          <button className="back-btn" aria-label="Назад" onClick={() => navigate('/support')}>
            ←
          </button>
          <h2 className="page-title">Обращение</h2>
        </div>

        <div className="detail-title-row" style={{ marginTop: 4 }}>
          <div className="detail-title">{t.subject}</div>
          <span className={`status-badge status-${statusKey}`}>{ui.labels[statusKey]}</span>
        </div>
        <div className="detail-updated">создано {new Date(t.created_at).toLocaleString('ru-RU')}</div>

        <div className="detail-section">
          <div className="detail-section-title">Сообщения</div>
          {msgsQ.isLoading && <div className="detail-desc">Загрузка…</div>}
          {!msgsQ.isLoading && messages.length === 0 && (
            <div className="detail-desc">Пока нет сообщений</div>
          )}
          {!msgsQ.isLoading && messages.length > 0 && (
            <>
              <div className="chat">
                {messages.map((m) => {
                  const isSupport = m.author === 'support'
                  const who = isSupport ? 'support' : 'Вы'
                  return (
                    <div key={m.id} className={`msg ${isSupport ? 'support' : 'user'}`}>
                      <div className="meta">
                        <span className="history-date">{new Date(m.created_at).toLocaleString('ru-RU')}</span>
                        {' · '}{who}
                      </div>
                      <div className="bubble">{m.body}</div>
                    </div>
                  )
                })}
              </div>
              <div ref={listEndRef} />
            </>
          )}
        </div>

        {/* Фиксированный низ */}
      </div>
      {createPortal(
        <div ref={inputWrapRef} className="chat-input-fixed">
          <div className="chat-input">
            {err && <div className="error" role="alert">{err}</div>}
            <div className="input-wrap">
              {body.trim() === '' && (
                <div className="input-placeholder">Напишите сообщение...</div>
              )}
              <textarea
                ref={taRef}
                className="input input-area auto-grow"
                rows={1}
                aria-label="Сообщение"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onInput={autoSize}
                style={{ height: taH, overflow: 'hidden' }}
              />
            </div>
            <button
              className="btn-send"
              style={{ height: taH, width: taH }}
              aria-label="Отправить"
              disabled={sendMutation.isPending || !body.trim()}
              onClick={() => sendMutation.mutate()}
            >
              ↑
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
