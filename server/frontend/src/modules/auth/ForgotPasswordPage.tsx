import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
// @ts-ignore react-hook-form types mismatch; rely on runtime export
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import '../../styles/forms.css'

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Введите e-mail')
    .email('Неверный e-mail'),
})
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await api.post('/auth/forgot', { email: values.email })
      // Переходим на экран успеха независимо от статуса,
      // чтобы не раскрывать существование/не существование e-mail
      // и пока backend-метод не реализован.
      // 2xx/4xx/405 — в любом случае показываем success.
    } catch {
      // ignore network errors for the same reason
    } finally {
      navigate('/forgot-password/success', { replace: true })
    }
  }

  return (
    <div className="page-full page-blue">
      <h1 className="auth-hero-title">Привет, Супер</h1>

      <div className="card auth-card">
        <h1 className="card-title">Восстановление пароля</h1>

        <form className="form" noValidate onSubmit={handleSubmit(onSubmit)}>
          <div className="form-field">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="Email"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && <small className="error" role="alert">{errors.email.message}</small>}
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Восстановить</button>
        </form>

        <div className="auth-footer">
          <div>
            <Link to="/login">АВТОРИЗАЦИЯ</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
