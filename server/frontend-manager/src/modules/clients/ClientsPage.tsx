import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../../lib/use-api'
import NewIcon from '../../assets/icons/new.svg?react'
import DoneIcon from '../../assets/icons/done.svg?react'
import MyIcon from '../../assets/icons/my.svg?react'
import RecycleIcon from '../../assets/icons/recycle.svg?react'
import SearchIcon from '../../assets/icons/search.svg?react'


const TABS = [
  { key: 'new', label: 'Новые', Icon: NewIcon },
  { key: 'processed', label: 'Обработанные', Icon: DoneIcon },
  { key: 'mine', label: 'Мои', Icon: MyIcon },
  { key: 'in_work', label: 'В работе', Icon: RecycleIcon },
]

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const STATUS_TRANSLATIONS: Record<string, string> = {
  new: 'Новый',
  in_verification: 'На проверке',
  awaiting_contract: 'Ожидает договор',
  awaiting_payment: 'Ожидает оплату',
  processed: 'Оформлен',
}

const TITLE_BY_TAB: Record<string, string> = {
  new: 'Новые',
  processed: 'Обработанные',
  mine: 'Мои заявки',
  in_work: 'В работе',
}

function getDisplayName(client: any): string {
  // 1) ФИО из паспорта
  const fio = client?.passport && [client.passport.last_name, client.passport.first_name, client.passport.middle_name]
    .filter(Boolean)
    .join(' ')
  if (fio && fio.trim()) return fio.trim()

  // 2) Явные поля, которые может прислать API
  const fromFlat = (client?.name || client?.user_name || client?.full_name);
  if (fromFlat && String(fromFlat).trim()) return String(fromFlat).trim()

  // 3) Вложенный пользователь
  const fromUser = client?.user?.name
  if (fromUser && String(fromUser).trim()) return String(fromUser).trim()

  return '—'
}

function getAddress(client: any): string {
  const a1 = client?.registration_address && String(client.registration_address).trim()
  if (a1) return a1
  const a2 = client?.address && String(client.address).trim()
  if (a2) return a2
  const a3 = client?.passport?.registration_address && String(client.passport.registration_address).trim()
  if (a3) return a3
  const a4 = client?.user?.address && String(client.user.address).trim()
  if (a4) return a4
  return ''
}

function ClientsPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const currentTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['clients', currentTab], [currentTab])
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getClients(currentTab),
  })

  const filtered = useMemo(() => {
    if (!data) return []
    const q = norm(query)
    if (!q) return data

    const nameOf = (c: any): string => {
      // 1) ФИО из паспорта
      const fio = c?.passport && [c.passport.last_name, c.passport.first_name, c.passport.middle_name]
        .filter(Boolean)
        .join(' ')
      if (fio && fio.trim()) return fio.trim()
      // 2) плоские поля
      const flat = c?.name || c?.user_name || c?.full_name
      if (flat && String(flat).trim()) return String(flat).trim()
      // 3) вложенный пользователь
      const un = c?.user?.name
      if (un && String(un).trim()) return String(un).trim()
      return ''
    }

    const addrOf = (c: any): string => {
      return (
        (c?.registration_address ?? '') ||
        (c?.address ?? '') ||
        (c?.passport?.registration_address ?? '') ||
        (c?.user?.address ?? '') ||
        ''
      ) as string
    }

    return data.filter((c) => {
      const haystack = [
        nameOf(c),
        c?.phone,
        c?.email,
        addrOf(c),
      ].map((v) => norm(String(v || '')))
      return haystack.some((v) => v.includes(q))
    })
  }, [data, query])

  const handleTabClick = (tab: string) => {
    setSearchParams({ tab })
  }

  const handleOpenClient = (clientId: string) => {
    navigate(`/clients/${clientId}/step/1?tab=${currentTab}`)
  }

  return (
    <div className="dashboard">
      <h1>{TITLE_BY_TAB[currentTab] ?? 'Заявки'}</h1>
      <div className="clients">
        <div className="container-320">
          <div className="clients__search">
            <SearchIcon aria-hidden="true" className="clients__search-icon" />
            <input
              id="clients-search"
              type="search"
              className="clients__search-input"
              placeholder="Поиск"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="clients__content clients__content--compact container-320">
          {isLoading && <p className="clients__placeholder">Загружаем клиентов…</p>}
          {isError && (
            <div className="clients__placeholder">
              <p>Не удалось загрузить список.</p>
              <button type="button" onClick={() => refetch()}>
                Повторить
              </button>
            </div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="clients__placeholder">Клиентов в этой вкладке пока нет.</p>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="container-320">
              <ul className="clients__list">
                {filtered.map((client) => (
                  <li key={client.id}>
                    <button type="button" className="client-card" onClick={() => handleOpenClient(client.id)}>
                      <span className="client-card__avatar" aria-hidden="true" />
                      <div className="client-card__main">
                        <div className="client-card__header">
                          <span className="client-card__name">{getDisplayName(client)}</span>
                          <span className={`client-card__status client-card__status--${client.status}`}>
                            {STATUS_TRANSLATIONS[client.status] ?? client.status}
                          </span>
                        </div>
                        <div className="client-card__body">
                          <span className="client-card__phone">
                            {(client?.user?.phone || client?.phone || '—')}
                            {getAddress(client) ? (
                              <>
                                <br />
                                <span className="client-card__address">{getAddress(client)}</span>
                              </>
                            ) : null}
                          </span>
                        </div>
                        <div className="client-card__footer">
                          <span className="client-card__updated">
                            Обновлён: {new Date(client.updated_at).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <nav className="navbar-bottom">
        <div className="inner">
          {TABS.map((tab) => (
            <a
              key={tab.key}
              href={`?tab=${tab.key}`}
              className={`item ${currentTab === tab.key ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); handleTabClick(tab.key) }}
            >
              <tab.Icon className="icon" aria-hidden="true" />
              <span>{tab.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default ClientsPage
