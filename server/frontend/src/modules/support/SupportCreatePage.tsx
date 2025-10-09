import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
import '../../styles/forms.css'
import { CloseFloating } from '../../shared/ui/CloseFloating'

const schema = z.object({
  subject: z.string().min(1, 'Укажите тему обращения'),
  text: z.string().min(1, 'Опишите, пожалуйста, проблему'),
})

type FormValues = z.infer<typeof schema>

export function SupportCreatePage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { subject: '', text: '' },
  })

  const navigate = useNavigate()
  const qc = useQueryClient()

  // POST в поддержку (эндпоинт можно скорректировать при необходимости)
  type CreatedSupport = { id: string; subject: string; created_at: string }

  const createSupport = async (payload: FormValues) => {
    // 1) создаём тикет
    const created = await api.post<CreatedSupport>('/support/', { subject: payload.subject })

    // 2) если пользователь ввёл текст — добавим сообщение от пользователя
    if (payload.text?.trim()) {
      await api.post(`/support/${created.id}/messages/user`, { body: payload.text })
    }

    return created
  }

  const mutation = useMutation({
    mutationFn: createSupport,
    onSuccess: () => {
      // оптимистично обновим списки
      qc.invalidateQueries({ queryKey: ['support'] })
      // экран успеха
      navigate('/support/success', { replace: true })
    },
  })

  const onSubmit = (data: FormValues) => mutation.mutate(data)

  return (
    <div className="page-blue">
      <div className="modal-wrap">
        <CloseFloating onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/support', { replace: true }))} />

        <div className="card auth-card">
          <h2 className="card-title">Новое обращение</h2>

        <form className="form form--wide" onSubmit={handleSubmit(onSubmit)}>
          <div className="form-field">
            <div className="label">Тема</div>
            <input
              className="input"
              placeholder="Коротко опишите тему"
              aria-invalid={!!errors.subject}
              {...register('subject')}
            />
            {errors.subject && <p className="error" role="alert">{errors.subject.message}</p>}
          </div>

          <div className="form-field">
            <div className="label">Сообщение</div>
            <textarea
              className="input input-area"
              placeholder="Опишите подробно"
              rows={5}
              aria-invalid={!!errors.text}
              {...register('text')}
            />
            {errors.text && <p className="error" role="alert">{errors.text.message}</p>}
          </div>

          <button className="btn btn-primary" disabled={mutation.isPending}>
            Отправить обращение
          </button>

          {mutation.isError && (
            <p className="error" role="alert">Не удалось отправить обращение. Попробуйте ещё раз.</p>
          )}
        </form>
      </div>
      </div>
    </div>
  )
}

export default SupportCreatePage
