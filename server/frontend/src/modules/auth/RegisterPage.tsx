import React, { useEffect, useRef, useState } from 'react'
// @ts-ignore react-hook-form types mismatch; rely on runtime export
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../shared/api'

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

const fullNameSchema = z
  .string()
  .min(5, 'Введите Имя и Фамилию')
  .refine((v) => /\s/.test(v), 'Введите Имя и Фамилию')
  .refine((v) => !/[0-9]/.test(v), 'Введите Имя и Фамилию')

const schema = z.object({
  name: fullNameSchema,
  email: z.string().email('Введите коорректный E-mail'),
  phone: z.string().min(10, 'Введите корректный номер телефона'),
  password: z.string().min(8, 'Введите минимум 8 символов'),
  address: z.string().min(8, 'Введите корректный адрес'),
})

type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, setValue, setError, clearErrors, formState: { errors, isSubmitting, isSubmitted } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { name: '', email: '', phone: '', password: '', address: '' },
  })

  const [submitError, setSubmitError] = useState<string>('')

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
    setSubmitError('')
    clearErrors()
    // backend сейчас не принимает address — не отправляем его в payload
    const payload = { name: data.name, email: data.email, phone: digits, password: data.password }
    try {
      // регистрируем
      await api.post('/auth/register', payload)
      // логинимся сразу после регистрации
      const loginResp = await api.post<{ access_token?: string; token?: string; accessToken?: string; refresh_token?: string }>(
        '/auth/login',
        {
          phone: digits,
          password: data.password,
        }
      )
      const token = loginResp?.access_token || (loginResp as any)?.token || (loginResp as any)?.accessToken
      const refresh = loginResp?.refresh_token
      if (!token) throw new Error('Нет access_token в ответе')
      try {
        localStorage.setItem('access_token', token)
        if (refresh) localStorage.setItem('refresh_token', refresh)
        // Сохраним адрес локально, чтобы показать на главной до синхронизации с бэком
        if (data.address) localStorage.setItem('user_address', data.address)
      } catch {}
      navigate('/')
    } catch (e: any) {
      console.error('Registration error', e)
      // Ошибка API/валидации
      const status = e?.status || e?.response?.status
      const detail = e?.response?.data?.detail

      const pushFieldError = (field: keyof FormValues, msg: string) => {
        setError(field, { type: 'server', message: msg })
      }

      // 8) дубликаты e-mail/телефона
      if (status === 409) {
        // Конфликт: уже существуют email и/или телефон
        let marked = false
        if (Array.isArray(detail)) {
          for (const it of detail) {
            const msg = it?.msg || 'уже зарегистрирован'
            const loc: any[] = Array.isArray(it?.loc) ? it.loc : []
            const field = (loc[1] as string) || ''
            if (field === 'email') { marked = true; pushFieldError('email', msg) }
            if (field === 'phone') { marked = true; pushFieldError('phone', msg) }
          }
        } else if (typeof detail === 'string') {
          const s = detail.toLowerCase()
          if (s.includes('mail')) { marked = true; pushFieldError('email', 'Этот e-mail уже зарегистрирован') }
          if (s.includes('тел') || s.includes('phone')) { marked = true; pushFieldError('phone', 'Этот телефон уже зарегистрирован') }
        }
        if (!marked) {
          // если сервер не указал конкретные поля — подсветим оба
          pushFieldError('email', 'Этот e-mail уже зарегистрирован')
          pushFieldError('phone', 'Этот телефон уже зарегистрирован')
        }
        setSubmitError('Такой e-mail и/или телефон уже зарегистрированы. Попробуйте использовать другие данные')
        return
      }

      let fallback: string | null = null

      if (typeof detail === 'string') {
        fallback = detail
      } else if (Array.isArray(detail)) {
        let anyField = false
        for (const it of detail) {
          const msg = it?.msg || 'некорректное значение'
          const loc: any[] = Array.isArray(it?.loc) ? it.loc : []
          const field = (loc[1] as string) || ''
          if (field === 'name') { anyField = true; pushFieldError('name', msg) }
          else if (field === 'email') { anyField = true; pushFieldError('email', msg) }
          else if (field === 'phone') { anyField = true; pushFieldError('phone', msg) }
          else if (field === 'password') { anyField = true; pushFieldError('password', msg) }
        }
        if (!anyField) {
          fallback = detail.map((it: any) => it?.msg || 'Ошибка').join('\n')
        }
      } else if (detail && typeof detail === 'object') {
        fallback = (detail as any).msg || JSON.stringify(detail)
      } else if (status) {
        // 9) если АПИ не ответило/ошибка — показать текст + номер ошибки
        fallback = `Что-то пошло не так и номер ошибки ответа от сервера ${status}`
      } else if (e?.message) {
        fallback = `Что-то пошло не так и номер ошибки ответа от сервера ${e.message}`
      }

      if (fallback) setSubmitError(fallback)
    }
  }

  return (
    <div className="page-full page-blue">
      <h1 className="auth-hero-title">Привет, Супер</h1>
      <div className="card auth-card">
        <h1 className="card-title">Регистрация</h1>
        {submitError && (
          <p className="error" role="alert" style={{ textAlign: 'center', marginBottom: 12 }}>{submitError}</p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="form">
          <div className="form-field">
            <label className="label">Имя Фамилия</label>
            <input className="input" placeholder="Иван Иванов" aria-invalid={!!errors.name} {...register('name')} />
            {errors.name && <small className="error" role="alert">{errors.name.message}</small>}
          </div>
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
            <label className="label">Адрес</label>
            <input className="input" placeholder="г. Москва, ул. Ленина, д. 8к2 кв 35" aria-invalid={!!errors.address} {...register('address')} />
            {errors.address && <small className="error" role="alert">{errors.address.message}</small>}
          </div>
          <div className="form-field">
            <label className="label">Email</label>
            <input className="input" placeholder="Email" aria-invalid={!!errors.email} {...register('email')} />
            {errors.email && <small className="error" role="alert">{errors.email.message}</small>}
          </div>
          <div className="form-field">
            <label className="label">Пароль</label>
            <input className="input" type="password" placeholder="Минимум 8 символов" aria-invalid={!!errors.password} {...register('password')} />
            {errors.password && <small className="error" role="alert">{errors.password.message}</small>}
          </div>
          <button className="btn btn-primary" disabled={isSubmitting}>Зарегистрироваться</button>
        </form>
        <div className="auth-footer">
          <div>
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
