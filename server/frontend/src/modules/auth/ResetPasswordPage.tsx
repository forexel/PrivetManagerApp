import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import '../../styles/forms.css'

export function ResetPasswordPage(){
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const token = sp.get('token') || ''

  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => { setErr('') }, [pwd, pwd2])

  const canSubmit = !!token && pwd.length >= 8 && pwd === pwd2 && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setErr('')
    try{
      const res = await fetch((import.meta.env.VITE_API_BASE || '/api/v1') + '/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pwd })
      })
      if(!res.ok){
        const code = res.status
        let msg = 'Не удалось установить пароль'
        try{ const j = await res.json(); msg = (j?.detail || msg) }catch{}
        if(code === 400 && msg === 'invalid_or_expired_token') msg = 'Ссылка недействительна или устарела'
        setErr(msg)
        return
      }
      setOk(true)
      setTimeout(() => navigate('/login', { replace:true }), 1200)
    }catch{
      setErr('Нет соединения с сервером')
    }finally{
      setBusy(false)
    }
  }

  return (
    <div className="page-full page-blue">
      <h1 className="auth-hero-title">Privet Super</h1>
      <div className="card auth-card" role="dialog" aria-labelledby="rp-title" aria-describedby="rp-desc">
        <h1 id="rp-title" className="card-title">Новый пароль</h1>
        {!token && (
          <p className="error" role="alert" style={{textAlign:'center'}}>Недействительная ссылка</p>
        )}
        {ok && (
          <p className="success-text" style={{textAlign:'center'}}>Пароль обновлён. Переходим к входу…</p>
        )}
        {!ok && (
        <form className="form" onSubmit={submit}>
          <div className="form-field">
            <label className="label">Новый пароль</label>
            <input className="input" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Минимум 8 символов" />
          </div>
          <div className="form-field">
            <label className="label">Повторите пароль</label>
            <input className="input" type="password" value={pwd2} onChange={e=>setPwd2(e.target.value)} placeholder="Ещё раз" />
          </div>
          {pwd && pwd2 && pwd!==pwd2 && (
            <p className="error" role="alert" style={{textAlign:'center'}}>Пароли не совпадают</p>
          )}
          {err && <p className="error" role="alert" style={{textAlign:'center'}}>{err}</p>}
          <button className="btn btn-primary" disabled={!canSubmit}>Сохранить пароль</button>
          <div className="auth-footer"><Link to="/login">Войти</Link></div>
        </form>
        )}
      </div>
    </div>
  )
}

export default ResetPasswordPage

