import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'

const PRICES = {
  month: { simple: 3999,  medium: 7999,  premium: 13999 },
  year:  { simple: 39990, medium: 79990, premium: 139990 },
}

const CARDS = [
  { plan: 'simple' as const,  title: 'Простой выбор',        desc: 'Базовое поддерживающее обслуживание дома' },
  { plan: 'medium' as const,  title: 'Спокойствие в деталях', desc: 'Базовое поддерживающее обслуживание дома' },
  { plan: 'premium' as const, title: 'Жизнь без забот',       desc: 'Базовое поддерживающее обслуживание дома' },
]

export default function SubscriptionPage() {
  const [period, setPeriod] = useState<'month'|'year'>('month')
  const nav = useNavigate()

  const buy = async (plan: 'simple'|'medium'|'premium') => {
    try {
      await api.post('/subscriptions/create', { plan, period })
      nav('/subscriptions/success', { replace: true })
    } catch {
      nav('/subscriptions/denied', { replace: true })
    }
  }

  return (
    <div className="dashboard">
      <h1 style={{textAlign:'center'}}>Подписка</h1>

      <div className="seg-toggle" role="tablist" aria-label="Период оплаты">
        <button
          role="tab"
          aria-selected={period === 'month'}
          className={period === 'month' ? 'active' : ''}
          onClick={() => setPeriod('month')}
          type="button"
        >
          Месячная
        </button>
        <button
          role="tab"
          aria-selected={period === 'year'}
          className={period === 'year' ? 'active' : ''}
          onClick={() => setPeriod('year')}
          type="button"
        >
          Годовая
        </button>

        {/* «ползунок» */}
        <span
          className="seg-toggle__thumb"
          aria-hidden="true"
          style={{ transform: `translateX(${period === 'year' ? '100%' : '0%'})` }}
        />
      </div>

      <div className="summary-cards">
        {CARDS.map(card => (
          <div key={card.plan} className="summary-card">
            <div className="title">{card.title}</div>
            <div className="meta">{card.desc}</div>
            <div className="cta" style={{marginTop:12}}>
              <button
                className="btn-choose-plan"
                onClick={() => buy(card.plan)}
              >
                {PRICES[period][card.plan].toLocaleString('ru-RU')} ₽/{period === 'month' ? 'мес' : 'год'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
