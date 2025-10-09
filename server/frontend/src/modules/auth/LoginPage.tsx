import React, { useEffect, useRef, useState } from 'react'
// @ts-ignore react-hook-form types mismatch; rely on runtime export
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../shared/api'
import '../../styles/forms.css'

// use shared api with BASE from env

// === phone helpers ===
const onlyDigits = (s: string) => s.replace(/\D/g, '')
function clamp10(d: string) { return d.slice(0, 10) }
function normalizeTo10(raw: string) {
  let d = onlyDigits(raw)
  if (d.startsWith('8')) d = d.slice(1)
  else if (d.startsWith('7')) d = d.slice(1)
  return clamp10(d)
}
function formatFromDigits(d: string) {
  d = clamp10(d)
  const a = d.slice(0, 3)
  const b = d.slice(3, 6)
  const c = d.slice(6, 8)
  const e = d.slice(8, 10)
  let out = '+7(' + a
  if (d.length >= 3) out += ')'
  if (b) out += b
  if (c) out += '-' + c
  if (e) out += '-' + e
  return out
}

const schema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, 'Введите телефон')
    .refine((v) => v.length === 10, 'Введите корректный телефон'),
  password: z.string().min(1, 'Введите пароль'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, isSubmitted } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { phone: '', password: '' },
  })

  const [authError, setAuthError] = useState<string>('')

  // держим только цифры (10) — UI форматируем из них
  const [digits, setDigits] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uiPhone = formatFromDigits(digits)

  useEffect(() => {
    setValue('phone', digits, { shouldValidate: isSubmitted, shouldDirty: true })
  }, [digits, setValue, isSubmitted])

  const onPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextDigits = normalizeTo10(e.target.value)
    setDigits(nextDigits)
  }

  const onPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const el = inputRef.current
      if (!el) return
      const selStart = el.selectionStart ?? uiPhone.length
      const selEnd = el.selectionEnd ?? uiPhone.length
      if (selStart === selEnd && selEnd === uiPhone.length) {
        e.preventDefault()
        if (digits.length > 0) setDigits(digits.slice(0, -1))
      }
    }
  }

  const onSubmit = async (data: FormValues) => {
    setAuthError('')
    const payload = { phone: digits, password: data.password }
    try {
      const resp = await api.post<{ access_token?: string; token?: string; accessToken?: string; refresh_token?: string }>(
        '/auth/login', payload)
      const token = resp?.access_token || (resp as any)?.token || (resp as any)?.accessToken
      const refresh = resp?.refresh_token
      if (!token) throw new Error('Нет access_token в ответе')
      try {
        localStorage.setItem('access_token', token)
        if (refresh) localStorage.setItem('refresh_token', refresh)
      } catch {}
      navigate('/')
    } catch {
      setAuthError('Неверный телефон или пароль')
    }
  }

  return (
    <div className="page-full page-blue">
      <h1 className="auth-hero-title">Привет, Супер</h1>
      <div className="card auth-card">
        <h1 className="card-title">Авторизация</h1>
        {authError && (
          <p className="error" role="alert" style={{ textAlign: 'center', marginBottom: 12 }}>{authError}</p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="form">
          <div className="form-field">
            <label className="label">Телефон</label>
            <input
              {...register('phone')}
              ref={inputRef}
              className="input"
              type="tel"
              data-phone="ru"
              autoComplete="tel"
              placeholder="+7("
              value={uiPhone}
              onChange={onPhoneChange}
              onKeyDown={onPhoneKeyDown}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && <small className="error" role="alert">{errors.phone.message}</small>}
          </div>
          <div className="form-field">
            <label className="label">Пароль</label>
            <input className="input" type="password" placeholder="Введите пароль..." aria-invalid={!!errors.password} {...register('password')} />
            {errors.password && <small className="error" role="alert">{errors.password.message}</small>}
          </div>
          <button className="btn btn-primary" disabled={isSubmitting}>Войти</button>
        </form>
        <div className="auth-footer">
          <div className="spacer">
            <Link to="/forgot-password">ЗАБЫЛИ ПАРОЛЬ?</Link>
          </div>
          <div>
            <Link to="/register">РЕГИСТРАЦИЯ</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
