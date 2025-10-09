import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
import AvatarIcon from '../../assets/profile/avatar.svg'
import PencilIcon from '../../assets/icons/pencil.svg?react'
import CancelIcon from '../../assets/icons/cancel.svg?react'
import AcceptIcon from '../../assets/icons/accept.svg?react'
import '../../styles/profile.css'
import { PLAN_TITLES, PERIOD_TITLES } from '../../shared/subscriptions'

type Me = { id: string; name?: string | null; email?: string | null; phone: string; address?: string | null }

export function ProfilePage() {
  const navigate = useNavigate()

  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState('')

  const [editName, setEditName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const [editEmail, setEditEmail] = useState(false)
  const [emailValue, setEmailValue] = useState('')

  const [editPwd, setEditPwd] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [saving, setSaving] = useState(false)

  // Активная подписка
  const [activeSub, setActiveSub] = useState<{ plan?: string|null; period?: string|null; paid_until?: string|null } | null>(null)

  const formatPhone = (raw?: string) => {
    if (!raw) return '—'
    const digits = String(raw).replace(/\D/g, '')
    // Ожидаем российский номер, убираем ведущую 7/8, оставляем 10 цифр
    let d = digits
    if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1)
    d = d.padEnd(10, '_').slice(0, 10)
    const a = d.slice(0, 3)
    const b = d.slice(3, 6)
    const c = d.slice(6, 8)
    const e = d.slice(8, 10)
    return `+7 (${a.replace(/_/g,' ')}) ${b.replace(/_/g,' ')}-${c.replace(/_/g,' ')}-${e.replace(/_/g,' ')}`.trim()
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await api.get<Me>('/user/me')
        if (!mounted) return
        setMe(data)
        setNameValue(data?.name || '')
        setEmailValue(data?.email || '')
        // подтянем активную подписку параллельно
        try {
          const sub = await api.get<{ plan?: string|null; period?: string|null; paid_until?: string|null }>(
            '/subscriptions/active'
          )
          if (mounted) setActiveSub(sub)
        } catch {}
      } catch (e: any) {
        if (!mounted) return
        setError('Не удалось загрузить профиль')
      } finally {
        // no-op
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const openEdit = (section: 'name' | 'email' | 'pwd') => {
    setEditName(section === 'name')
    setEditEmail(section === 'email')
    setEditPwd(section === 'pwd')
    setPwdError('')
  }

  const saveProfile = async (payload: Partial<Pick<Me, 'name' | 'email'>>) => {
    try {
      setSaving(true)
      const updated = await api.put<Me>('/user', payload as any)
      setMe(updated)
      setNameValue(updated?.name || '')
      setEmailValue(updated?.email || '')
      setEditName(false)
      setEditEmail(false)
    } catch (e: any) {
      setError('Не удалось сохранить изменения')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    try {
      setSaving(true)
      await api.post<null>('/user/change-password', { old_password: oldPwd, new_password: newPwd } as any)
      setEditPwd(false)
      setOldPwd('')
      setNewPwd('')
      setPwdError('')
    } catch (e: any) {
      setPwdError(e?.status === 400 ? 'Старый пароль неверный' : 'Не удалось сменить пароль')
    } finally {
      setSaving(false)
    }
  }

  const onLogout = () => {
    try {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    } catch {}
    navigate('/login')
  }

  return (
    <div className="dashboard profile">
      <div className="profile-header">
        <div className="profile-avatar">
          <img src={AvatarIcon} alt="Аватар" />
        </div>
        <div className="profile-name">{me?.name || '—'}</div>
        <div className="profile-email">{me?.email || '—'}</div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="info-list">
        {/* Имя Фамилия */}
        <div className="info-item">
          <div className="text" style={{ flex: 1 }}>
            <div className="info-title">Имя Фамилия</div>
            {!editName ? (
              <div className="info-subtitle">{me?.name || '—'}</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder="Иван Иванов"
                  style={{ width: 'auto', margin: 0 }}
                />
                <button
                  className="info-edit icon-round accept"
                  aria-label="Сохранить"
                  onClick={() => saveProfile({ name: nameValue })}
                  disabled={saving}
                >
                  <AcceptIcon className="icon-accept" />
                </button>
                <button
                  className="info-edit icon-round cancel"
                  aria-label="Отмена"
                  onClick={() => {
                    setEditName(false)
                    setNameValue(me?.name || '')
                  }}
                >
                  <CancelIcon className="icon-cancel" />
                </button>
              </div>
            )}
          </div>
          {!editName && (
            <button className="info-edit" aria-label="Редактировать имя" onClick={() => openEdit('name')}>
              <PencilIcon className="pencil-icon" />
            </button>
          )}
        </div>

        {/* Телефон */}
        <div className="info-item">
          <div className="text">
            <div className="info-title">Телефон</div>
            <div className="info-subtitle">{formatPhone(me?.phone)}</div>
          </div>
        </div>

        {/* Email */}
        <div className="info-item">
          <div className="text" style={{ flex: 1 }}>
            <div className="info-title">Email</div>
            {!editEmail ? (
              <div className="info-subtitle">{me?.email || '—'}</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  placeholder="email@domain.ru"
                  style={{ width: 'auto', margin: 0 }}
                />
                <button
                  className="info-edit icon-round accept"
                  aria-label="Сохранить"
                  onClick={() => saveProfile({ email: emailValue || undefined })}
                  disabled={saving}
                >
                  <AcceptIcon className="icon-accept" />
                </button>
                <button
                  className="info-edit icon-round cancel"
                  aria-label="Отмена"
                  onClick={() => {
                    setEditEmail(false)
                    setEmailValue(me?.email || '')
                  }}
                >
                  <CancelIcon className="icon-cancel" />
                </button>
              </div>
            )}
          </div>
          {!editEmail && (
            <button className="info-edit" aria-label="Редактировать email" onClick={() => openEdit('email')}>
              <PencilIcon className="pencil-icon" />
            </button>
          )}
        </div>

        {/* Тариф */}
        <div className="info-item">
          <div className="text">
            <div className="info-title">Тариф</div>
            <div className="info-subtitle">
              {activeSub?.plan
                ? (PLAN_TITLES as any)[activeSub.plan as keyof typeof PLAN_TITLES] || activeSub.plan
                : 'Нет активной подписки'}
              {activeSub?.period ? ` • ${(PERIOD_TITLES as any)[activeSub.period as keyof typeof PERIOD_TITLES] || activeSub.period}` : ''}
            </div>
          </div>
        </div>

        {/* Оплачен до */}
        <div className="info-item">
          <div className="text">
            <div className="info-title">Оплачен до</div>
            <div className="info-subtitle">
              {activeSub?.paid_until
                ? new Date(activeSub.paid_until as any).toLocaleDateString('ru-RU')
                : '—'}
            </div>
          </div>
        </div>

        {/* Смена пароля */}
        <div className="info-item">
          <div className="text" style={{ flex: 1 }}>
            <div className="info-title">Смена пароля</div>
            {!editPwd ? (
              <div className="info-subtitle">••••••••</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="input"
                  type="password"
                  placeholder="Старый пароль"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  style={{ width: 'auto', margin: 0 }}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Минимум 8 символов"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  style={{ width: 'auto', margin: 0 }}
                />
                {pwdError && (
                  <div className="error" role="alert">{pwdError}</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="info-edit icon-round accept"
                    aria-label="Сохранить"
                    onClick={changePassword}
                    disabled={saving || newPwd.length < 8 || !oldPwd}
                  >
                    <AcceptIcon className="icon-accept" />
                  </button>
                  <button
                    className="info-edit icon-round cancel"
                    aria-label="Отмена"
                    onClick={() => {
                      setEditPwd(false)
                      setOldPwd('')
                      setNewPwd('')
                      setPwdError('')
                    }}
                  >
                    <CancelIcon className="icon-cancel" />
                  </button>
                </div>
              </div>
            )}
          </div>
          {!editPwd && (
            <button className="info-edit" aria-label="Сменить пароль" onClick={() => openEdit('pwd')}>
              <PencilIcon className="pencil-icon" />
            </button>
          )}
        </div>
      </div>

      <div className="profile-actions">
        <button className="btn btn-primary profile-logout" onClick={onLogout}>Выйти</button>
        <button
          className="profile-danger"
          onClick={() => navigate('/profile/delete')}
          style={{ background:'transparent', border:0, cursor:'pointer' }}
        >
          Удалить аккаунт
        </button>
      </div>
    </div>
  )
}

export default ProfilePage
