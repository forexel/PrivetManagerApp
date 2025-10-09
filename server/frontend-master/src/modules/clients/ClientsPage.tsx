import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../../lib/use-api'

const TABS = [
  { key: 'new', label: 'Новые' },
  { key: 'processed', label: 'Обработанные' },
  { key: 'mine', label: 'Мои' },
]

const STATUS_TRANSLATIONS: Record<string, string> = {
  new: 'Новый',
  in_verification: 'На проверке',
  awaiting_contract: 'Ожидает договор',
  awaiting_payment: 'Ожидает оплату',
  processed: 'Оформлен',
}

function ClientsPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['clients', currentTab], [currentTab])
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getClients(currentTab),
  })

  const handleTabClick = (tab: string) => {
    setSearchParams({ tab })
  }

  const handleOpenClient = (clientId: string) => {
    navigate(`/clients/${clientId}?tab=${currentTab}`)
  }

  return (
    <div className="clients">
      <div className="clients__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`clients__tab ${currentTab === tab.key ? 'clients__tab--active' : ''}`}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="clients__content">
        {isLoading && <p className="clients__placeholder">Загружаем клиентов…</p>}
        {isError && (
          <div className="clients__placeholder">
            <p>Не удалось загрузить список.</p>
            <button type="button" onClick={() => refetch()}>
              Повторить
            </button>
          </div>
        )}
        {!isLoading && !isError && data && data.length === 0 && (
          <p className="clients__placeholder">Клиентов в этой вкладке пока нет.</p>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <ul className="clients__list">
            {data.map((client) => (
              <li key={client.id}>
                <button type="button" className="client-card" onClick={() => handleOpenClient(client.id)}>
                  <div className="client-card__header">
                    <span className="client-card__name">{client.full_name ?? client.user_id}</span>
                    <span className={`client-card__status client-card__status--${client.status}`}>
                      {STATUS_TRANSLATIONS[client.status] ?? client.status}
                    </span>
                  </div>
                  <div className="client-card__body">
                    <span>{client.phone}</span>
                    {client.email && <span>{client.email}</span>}
                  </div>
                  <div className="client-card__footer">
                    <span>{client.devices_count} устройств</span>
                    <span>Обновлён: {new Date(client.updated_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ClientsPage
