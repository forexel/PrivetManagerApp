import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
import '../../styles/forms.css'

export default function ProfileDeletePage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onDelete = async () => {
    setErr('')
    try {
      setBusy(true)
      await api.del<null>('/user')
      try { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token') } catch {}
      navigate('/login', { replace: true })
    } catch (e: any) {
      setErr('Не удалось удалить аккаунт')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-blue">
      <div className="card auth-card" role="dialog" aria-labelledby="del-title" aria-describedby="del-desc">
        <h2 id="del-title" className="card-title">Удаление аккаунта</h2>
        <p id="del-desc" className="success-text">
          Вы точно хотите удалить аккаунт? Восстановление будет невозможно.
        </p>
        {err && <p className="error-text" role="alert">{err}</p>}
        <div className="cta" style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <button className="btn btn-primary" onClick={() => navigate('/profile')} disabled={busy}>
            Вернуться
          </button>
          <button className="btn btn-secondary" onClick={onDelete} disabled={busy}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}
