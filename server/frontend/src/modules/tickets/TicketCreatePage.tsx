// @ts-ignore react-hook-form types mismatch; rely on runtime export
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/api'
import '../../styles/forms.css'
import { CloseFloating } from '../../shared/ui/CloseFloating'

const schema = z.object({
  title: z.string().min(1, 'Укажите тему'),
  description: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function TicketCreatePage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '' },
  })

  const navigate = useNavigate()
  const qc = useQueryClient()

  // API-вызов создания
  type CreatedTicket = {
    id: string
    title: string
    status: 'new' | 'in_progress' | 'completed' | 'reject'
    created_at: string
  }
  const createTicket = async (payload: FormValues) => {
    const created = await api.post<CreatedTicket>('/tickets/', payload)
    return created
  }

  // Мутация + обновление кэша
  const mutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (created) => {
      // мгновенно подставляем в список пользователя
      qc.setQueryData<any[]>(['tickets', 'my'], (old) =>
        old ? [created, ...old] : [created]
      )

      // а затем всё равно перезагрузим оба ключа
      qc.invalidateQueries({ queryKey: ['tickets', 'my'] })
      qc.invalidateQueries({ queryKey: ['tickets'] })

      navigate('/tickets/success', { replace: true })
    },
  })

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data)
  }

  return (
    <div className="page-blue">
      <div className="modal-wrap">
        <CloseFloating onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/tickets', { replace: true }))} />

        <div className="card auth-card">
          <h2 className="card-title">Оформление заявки</h2>

          <form className="form form--wide ticket-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="form-field">
            <div className="label">Что сломалось?</div>
            <input
              className="input"
              placeholder="Укажи кратко в чем проблема?"
              aria-invalid={!!errors.title}
              {...register('title', { required: 'Укажите тему' })}
            />
            {errors.title && (
              <p className="error" role="alert">{errors.title.message}</p>
            )}
          </div>

          <div className="form-field">
            <div className="label">Подробное описание</div>
            <textarea
              className="input input-area"
              placeholder="Опишите подробно"
              rows={5}
              aria-invalid={!!errors.description}
              {...register('description')}
            />
            {errors.description && (
              <p className="error" role="alert">{errors.description.message}</p>
            )}
          </div>

          <button className="btn btn-primary" disabled={mutation.isPending}>
            Отправить заявку
          </button>

          {mutation.isError && (
            <p className="error" role="alert">
              Не удалось создать заявку. Попробуйте ещё раз.
            </p>
          )}
        </form>
      </div>
      </div>
    </div>
  )
}
