import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginManager } from '../../lib/api-client'

import '../../styles/forms.css'
import '../../styles/style.css'

type LoginPayload = { email: string; password: string }

const loginSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
})

type LoginForm = z.infer<typeof loginSchema>

type LoginPageProps = {
  onSuccess: (accessToken: string) => void
}

function LoginPage({ onSuccess }: LoginPageProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mutation = useMutation<{ access_token: string }, Error, LoginPayload>({
    mutationFn: (payload: LoginPayload) => loginManager(payload),
    onSuccess: (data) => {
      setErrorMessage(null)
      onSuccess(data.access_token)
      window.location.replace('/clients?tab=new')

    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось войти')
    },
  })

  const onSubmit = handleSubmit(({ email, password }) =>
    mutation.mutate({ email, password })
  )

return (
  <div className="page-blue">
    <h1 className="auth-hero-title">Привет, менеджер</h1>
    <div className="card auth-card">
      <h1 className="card-title">Авторизация</h1>

      <form className="form" onSubmit={onSubmit}>
        {errorMessage && (
          <p className="error" role="alert">{errorMessage}</p>
        )}
        <div className="form-field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            {...register('email')}
            disabled={mutation.isPending}
            aria-invalid={!!errors.email}
          />
          {errors.email && <small className="error" role="alert">{errors.email.message}</small>}
        </div>

        <div className="form-field">
          <label className="label" htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            {...register('password')}
            disabled={mutation.isPending}
            aria-invalid={!!errors.password}
          />
          {errors.password && <small className="error" role="alert">{errors.password.message}</small>}
        </div>

        <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  </div>
)
}

export default LoginPage
