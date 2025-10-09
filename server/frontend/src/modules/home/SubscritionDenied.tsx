import { useNavigate } from 'react-router-dom'
import { CloseFloating } from '../../shared/ui/CloseFloating'
import '../../styles/forms.css'

export default function SubscriptionDenied() {
  const nav = useNavigate()
  return (
    <div className="page-full page-blue">
      <div className="modal-wrap modal-wrap--wide">
        <CloseFloating onClick={() => (window.history.length > 1 ? nav(-1) : nav('/subscriptions', { replace: true }))} />
        <div className="card auth-card" style={{ maxWidth: 360 }}>
          <h1 className="card-title">Оплата не прошла</h1>
          <p style={{textAlign:'center', margin:'8px 0 16px'}}>
            Попробуйте ещё раз или выберите другой способ.
          </p>
          <button className="btn btn-primary" onClick={() => nav('/subscriptions', { replace:true })}>
            Вернуться
          </button>
      </div>
      </div>
    </div>
  )
}
