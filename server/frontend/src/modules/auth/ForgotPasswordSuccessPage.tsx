import '../../styles/forms.css'
import { useNavigate } from 'react-router-dom'

export default function ForgotPasswordSuccessPage() {
  const navigate = useNavigate()
  return (
    <div className="page-full page-blue">
      <h1 className="auth-hero-title">Привет, Супер</h1>
      <div className="card auth-card" role="dialog" aria-labelledby="fp-title" aria-describedby="fp-desc">
        <h1 id="fp-title" className="card-title">Проверьте почту</h1>
        <p id="fp-desc" className="success-text">
          Если такой e-mail существует, на него отправлено письмо с инструкциями по восстановлению пароля.
        </p>
        <div className="success-actions">
          <button className="btn btn-primary" onClick={() => navigate('/login')}>Вернуться к входу</button>
        </div>
      </div>
    </div>
  )
}

