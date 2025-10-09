import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginMaster } from '../../lib/api-client'

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

  const mutation = useMutation({
    mutationFn: loginMaster,
    onSuccess: (data) => {
      setErrorMessage(null)
      onSuccess(data.access_token)
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось войти')
    },
  })

  const onSubmit = handleSubmit((values) => mutation.mutate(values))

  return (
    <div className="auth-page">
      <div className="auth-wrapper">
        <div className="auth-card">
          <h1 className="auth-title">Вход для мастеров</h1>
          <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="auth-input"
            {...register('email')}
            disabled={mutation.isPending}
          />
          {errors.email && <p className="auth-error">{errors.email.message}</p>}

          <label className="auth-label" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="auth-input"
            {...register('password')}
            disabled={mutation.isPending}
          />
          {errors.password && <p className="auth-error">{errors.password.message}</p>}

          {errorMessage && <div className="auth-banner auth-banner--error">{errorMessage}</div>}

          <button className="auth-submit" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Входим…' : 'Войти'}
          </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
