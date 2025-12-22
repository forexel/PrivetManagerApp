import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useApi } from '../../lib/use-api'
import { resizeImage } from '../../lib/image'
import type {
  ClientDetail,
  ClientProfileUpdate,
  DeviceCreate,
  DeviceUpdate,
  PassportUpsert,
  TariffCalculateRequest,
  BillingNotifyRequest,
} from '../../lib/api-client'

const passportSchema = z.object({
  last_name: z.string().min(1),
  first_name: z.string().optional().nullable(),
  middle_name: z.string().optional().nullable(),
  series: z.string().optional().nullable(),
  number: z.string().optional().nullable(),
  issued_by: z.string().optional().nullable(),
  issue_code: z.string().optional().nullable(),
  issue_date: z.string().nullable().optional(),
  registration_address: z.string().optional().nullable(),
  photo_url: z.string().url().nullable().optional(),
})

const profileSchema = z.object({
  phone: z.string().min(5),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
})

const deviceSchema = z.object({
  device_type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  specs: z.record(z.any()).optional().nullable(),
  extra_fee: z.number().min(0).default(0),
})

const DEVICE_TYPES = [
  'телефон',
  'телевизор',
  'роутер',
  'холодильник',
  'плита',
  'варочная панель',
  'вытяжка',
  'духовка',
]

function ClientDetailPage() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['client', clientId], [clientId])
  const { data, isLoading, isError, refetch } = useQuery<ClientDetail>({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })

  const updateDetailCache = (detail: ClientDetail) => {
    queryClient.setQueryData<ClientDetail>(queryKey, detail)
    queryClient.invalidateQueries({ queryKey: ['clients'] })
  }

  const profileForm = useForm<ClientProfileUpdate>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      phone: data?.user.phone ?? '',
      email: data?.user.email ?? null,
      name: data?.user.name ?? null,
      address: data?.user.address ?? data?.passport?.registration_address ?? null,
    },
    values: data
      ? {
          phone: data.user.phone,
          email: data.user.email,
          name: data.user.name,
          address: data.user.address ?? data.passport?.registration_address ?? null,
        }
      : undefined,
  })

  const passportForm = useForm<PassportUpsert>({
    resolver: zodResolver(passportSchema),
    defaultValues: data?.passport ?? {
      last_name: null,
      first_name: null,
      middle_name: '',
      series: null,
      number: null,
      issued_by: null,
      issue_code: null,
      issue_date: null,
      registration_address: null,
      photo_url: null,
    },
    values: data?.passport ?? undefined,
  })

  const deviceForm = useForm<DeviceCreate>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      device_type: DEVICE_TYPES[0],
      title: '',
      description: '',
      specs: null,
      extra_fee: 0,
    },
  })

  const [isDeviceFormVisible, setDeviceFormVisible] = useState(false)
  const billingForm = useForm<BillingNotifyRequest>({
    resolver: zodResolver(
      z.object({
        amount: z.number().min(0.01),
        description: z.string().min(1),
        contract_number: z.string().min(1),
        due_date: z.string().min(1),
      })
    ),
    defaultValues: {
      amount: 0,
      description: 'Дополнительная оплата по договору',
      contract_number: '',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    },
  })

  useEffect(() => {
    if (!data) return
    billingForm.reset({
      amount: data.tariff?.total_extra_fee ?? 0,
      description: data.contract?.contract_number
        ? `Доп оплата по договору ${data.contract.contract_number}`
        : 'Дополнительная оплата по договору',
      contract_number: data.contract?.contract_number ?? '',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    })
  }, [data, billingForm])

  const profileMutation = useMutation<ClientDetail, unknown, ClientProfileUpdate>({
    mutationFn: (payload) => api.updateProfile(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const passportMutation = useMutation<ClientDetail, unknown, PassportUpsert>({
    mutationFn: (payload) => api.upsertPassport(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const createDeviceMutation = useMutation<ClientDetail, unknown, DeviceCreate>({
    mutationFn: (payload) => api.createDevice(clientId, payload),
    onSuccess: (detail) => {
      updateDetailCache(detail)
      deviceForm.reset()
      setDeviceFormVisible(false)
    },
  })

  const updateDeviceMutation = useMutation<ClientDetail, unknown, { deviceId: string; payload: DeviceUpdate }>({
    mutationFn: ({ deviceId, payload }) => api.updateDevice(clientId, deviceId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const deleteDeviceMutation = useMutation<ClientDetail, unknown, string>({
    mutationFn: (deviceId) => api.deleteDevice(clientId, deviceId),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const uploadPhotoMutation = useMutation<ClientDetail, unknown, { deviceId: string; file: File }>({
    mutationFn: async ({ deviceId, file }) => {
      const { blob, mimeType, fileName } = await resizeImage(file, 1200)
      const processedFile = new File([blob], fileName, { type: mimeType })
      const presigned = await api.createDevicePhotoUpload(clientId, deviceId, processedFile.type)

      // гарантируем строковые поля
      const fields: Record<string, string> = presigned.fields as unknown as Record<string, string>
      const formData = new FormData()
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value)
      }
      formData.append('file', processedFile, processedFile.name)

      const response = await fetch(presigned.url, { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Не удалось загрузить файл')

      return api.addDevicePhoto(clientId, deviceId, presigned.file_key)
    },
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const deletePhotoMutation = useMutation<ClientDetail, unknown, { deviceId: string; photoId: string }>({
    mutationFn: ({ deviceId, photoId }) => api.deleteDevicePhoto(clientId, deviceId, photoId),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const applyTariffMutation = useMutation<ClientDetail, unknown, TariffCalculateRequest>({
    mutationFn: (payload) => api.applyTariff(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const contractMutation = useMutation<unknown, unknown, void>({
    mutationFn: () => api.generateContract(clientId),
    onSuccess: () => refetch(),
  })

  const confirmContractMutation = useMutation<ClientDetail, unknown, string>({
    mutationFn: (otp: string) => api.confirmContract(clientId, { otp_code: otp }),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const paymentMutation = useMutation<ClientDetail, unknown, void>({
    mutationFn: () => api.confirmPayment(clientId, {}),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const billingMutation = useMutation<ClientDetail, unknown, BillingNotifyRequest>({
    mutationFn: (payload) => api.notifyBilling(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const handleSaveProfile = profileForm.handleSubmit((values) => {
    profileMutation.mutate(values)
  })

  const handleSavePassport = passportForm.handleSubmit((values) => {
    passportMutation.mutate(values)
  })

  const handleAddDevice = deviceForm.handleSubmit((values) => {
    const payload: DeviceCreate = {
      ...values,
      specs: values.specs ?? null,
      description: values.description ?? null,
    }
    createDeviceMutation.mutate(payload)
  })

  const handleTariffApply = () => {
    const deviceCount = data?.devices.length ?? 0
    applyTariffMutation.mutate({ device_count: deviceCount, tariff_id: data?.tariff?.tariff_id ?? undefined })
  }

  const handleGenerateContract = () => {
    contractMutation.mutate()
  }

  const handleConfirmContract = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const otp = String(form.get('otp') ?? '')
    if (otp.length === 0) return
    confirmContractMutation.mutate(otp)
    event.currentTarget.reset()
  }

  const handleConfirmPayment = () => {
    paymentMutation.mutate()
  }

  const handleSendInvoice = billingForm.handleSubmit((values) => {
    billingMutation.mutate(values)
  })

  const handleUploadPhoto = (deviceId: string, file?: File | null) => {
    if (!file) return
    uploadPhotoMutation.mutate({ deviceId, file })
  }

  const goBack = () => {
    navigate(`/clients?tab=${returnTab}`)
  }

  if (isLoading) {
    return <p className="clients__placeholder">Загружаем карточку клиента…</p>
  }

  if (isError || !data) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось загрузить клиента.</p>
        <button type="button" onClick={() => refetch()}>
          Повторить
        </button>
      </div>
    )
  }

  return (
    <div className="client-detail">
      <button type="button" className="client-detail__back" onClick={goBack}>
        ← Назад
      </button>

      <section className="client-detail__section">
        <h2>Шаг 1. Данные клиента</h2>
        <form className="client-form" onSubmit={handleSaveProfile}>
          <label>
            Телефон
            <input type="tel" {...profileForm.register('phone')} />
          </label>
          <label>
            Email
            <input type="email" {...profileForm.register('email')} />
          </label>
          <label>
            Имя
            <input type="text" {...profileForm.register('name')} />
          </label>
          <button type="submit" disabled={profileMutation.isPending}>
            Сохранить данные
          </button>
        </form>
      </section>

      <section className="client-detail__section">
        <h2>Шаг 2. Паспортные данные</h2>
        <form className="client-form" onSubmit={handleSavePassport}>
          <div className="client-form__grid">
            <label>
              Фамилия
              <input type="text" {...passportForm.register('last_name')} />
            </label>
            <label>
              Имя
              <input type="text" {...passportForm.register('first_name')} />
            </label>
            <label>
              Отчество
              <input type="text" {...passportForm.register('middle_name')} />
            </label>
            <label>
              Серия
              <input type="text" {...passportForm.register('series')} />
            </label>
            <label>
              Номер
              <input type="text" {...passportForm.register('number')} />
            </label>
            <label>
              Кем выдан
              <input type="text" {...passportForm.register('issued_by')} />
            </label>
            <label>
              Код подразделения
              <input type="text" {...passportForm.register('issue_code')} />
            </label>
            <label>
              Дата выдачи
              <input type="date" {...passportForm.register('issue_date')} />
            </label>
            <label className="client-form__full">
              Адрес регистрации
              <input type="text" {...passportForm.register('registration_address')} />
            </label>
          </div>
          <button type="submit" disabled={passportMutation.isPending}>
            Сохранить паспорт
          </button>
        </form>
      </section>

      <section className="client-detail__section client-step">
        <h2>Шаг 1. Данные клиента</h2>
        <div className="step-card">
          <form className="form form--wide" onSubmit={handleSaveProfile}>
            <ul className="kv">
              <li className="kv__row">
                <span className="kv__label">Телефон</span>
                <span className="kv__value">
                  <input
                    className="input input--inline"
                    type="tel"
                    placeholder="+7 (___) ___-__-__"
                    {...profileForm.register('phone')}
                  />
                  <button type="button" className="icon-btn" aria-label="Редактировать телефон" title="Редактировать">
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-0.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>
                  </button>
                </span>
              </li>

              <li className="kv__row">
                <span className="kv__label">Email</span>
                <span className="kv__value">
                  <input
                    className="input input--inline"
                    type="email"
                    placeholder="example@mail.ru"
                    {...profileForm.register('email')}
                  />
                  <button type="button" className="icon-btn" aria-label="Редактировать email" title="Редактировать">
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-0.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>
                  </button>
                </span>
              </li>

              <li className="kv__row">
                <span className="kv__label">Имя</span>
                <span className="kv__value">
                  <input
                    className="input input--inline"
                    type="text"
                    placeholder="Имя клиента"
                    {...profileForm.register('name')}
                  />
                  <button type="button" className="icon-btn" aria-label="Редактировать имя" title="Редактировать">
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-0.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>
                  </button>
                </span>
              </li>
              <li className="kv__row">
                <span className="kv__label">Адрес</span>
                <span className="kv__value">
                  <input
                    className="input input--inline"
                    type="text"
                    placeholder="Адрес клиента"
                    {...profileForm.register('address')}
                  />
                  <button type="button" className="icon-btn" aria-label="Редактировать адрес" title="Редактировать">
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-0.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>
                  </button>
                </span>
              </li>
            </ul>

            <div className="step-actions">
              <button className="btn btn-primary" type="submit" disabled={profileMutation.isPending}>
                Сохранить данные
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="client-detail__section">
        <div className="section-header">
          <h2>Шаг 4. Тариф и расчёт</h2>
          <button type="button" onClick={handleTariffApply} disabled={applyTariffMutation.isPending}>
            Рассчитать доплату
          </button>
        </div>
        {data.tariff ? (
          <div className="tariff-card">
            <p>Устройств: {data.tariff.device_count}</p>
            <p>Доплата за устройство: {data.tariff.extra_per_device ?? 1000} ₽</p>
            <p>Доплата всего: {data.tariff.total_extra_fee.toLocaleString('ru-RU')} ₽</p>
          </div>
        ) : (
          <p>Доплата ещё не рассчитана</p>
        )}
      </section>

      <section className="client-detail__section">
        <div className="section-header">
          <h2>Шаг 5–6. Договор и оплата</h2>
          <button type="button" onClick={handleGenerateContract} disabled={contractMutation.isPending}>
            Сформировать договор
          </button>
        </div>
        {data.contract?.otp_code && (
          <div className="contract-card">
            <p>Отправлен код: {data.contract.otp_code}</p>
            <form className="contract-card__form" onSubmit={handleConfirmContract}>
              <input name="otp" type="text" placeholder="Введите код" />
              <button type="submit" disabled={confirmContractMutation.isPending}>
                Подписать
              </button>
            </form>
          </div>
        )}
        {data.contract?.signed_at && <p>Договор подписан: {new Date(data.contract.signed_at).toLocaleString('ru-RU')}</p>}
        {data.contract?.payment_confirmed_at ? (
          <p>Оплата подтверждена: {new Date(data.contract.payment_confirmed_at).toLocaleString('ru-RU')}</p>
        ) : (
          <button type="button" onClick={handleConfirmPayment} disabled={paymentMutation.isPending}>
            Подтвердить оплату
          </button>
        )}
        {data.contract?.contract_url && (
          <a href={data.contract.contract_url} target="_blank" rel="noreferrer">
            Скачать договор (№ {data.contract.contract_number ?? '—'})
          </a>
        )}
      </section>

      <section className="client-detail__section">
        <div className="section-header">
          <h2>Счёт клиенту</h2>
        </div>
        <form className="client-form" onSubmit={handleSendInvoice}>
          <label>
            Сумма, ₽
            <input type="number" step="100" min="0" {...billingForm.register('amount', { valueAsNumber: true })} />
          </label>
          <label>
            Описание
            <input type="text" {...billingForm.register('description')} />
          </label>
          <label>
            Номер договора
            <input type="text" {...billingForm.register('contract_number')} />
          </label>
          <label>
            Оплатить до
            <input type="date" {...billingForm.register('due_date')} />
          </label>
          <button type="submit" disabled={billingMutation.isPending}>
            Отправить счёт
          </button>
        </form>
        {data.invoices.length > 0 && (
          <div className="invoice-list">
            <h3>История счетов</h3>
            <ul>
              {data.invoices.map((invoice) => (
                <li key={invoice.id}>
                  № {invoice.contract_number} — {invoice.amount.toLocaleString('ru-RU')} ₽ до{' '}
                  {new Date(invoice.due_date).toLocaleDateString('ru-RU')} ({invoice.status})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

export default ClientDetailPage
