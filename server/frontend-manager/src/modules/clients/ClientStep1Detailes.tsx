import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useApi } from '../../lib/use-api'
import type { ClientDetail, ClientProfileUpdate, PassportUpsert } from '../../lib/api-client'
import PencilIcon from '../../assets/icons/pencil.svg'
import AcceptIcon from '../../assets/icons/accept.svg'
import CancelIcon from '../../assets/icons/cancel.svg'

const phonePattern = /^\d{10}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const addressPattern = /^(?:г\\.|город|п\\.|пос\.|поселок|посёлок|п|деревня|д\\.|село|с\\.)\\s*[А-Яа-яЁё]{3,}/i

const profileSchema = z.object({
  phone: z.string().regex(phonePattern, 'Введите 10 цифр без пробелов'),
  email: z.string().regex(emailPattern, 'Некорректный e-mail').nullable().optional(),
  name: z.string().nullable().optional(),
  address: z.string().regex(addressPattern, 'Укажите населённый пункт и название (например, \"г. Москва\")').nullable().optional(),
})

export default function ClientStep1() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnTab = searchParams.get('tab') ?? 'new'

  const queryKey = ['client', clientId] as const
  const { data, isLoading, isError, refetch } = useQuery<ClientDetail>({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })

  const updateDetailCache = (detail: ClientDetail) => {
    queryClient.setQueryData<ClientDetail>(queryKey, detail)
    queryClient.invalidateQueries({ queryKey: ['clients'] })
  }

  const profileForm = useForm<{ phone: string; email: string | null | undefined; name: string | null | undefined; address: string | null | undefined }>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      phone: data?.user.phone ?? '',
      email: data?.user.email ?? null,
      name: data?.user.name ?? null,
      address: data?.user.address ?? data?.passport?.registration_address ?? null,
    },
    values: data
      ? {
          phone: data.user.phone ?? '',
          email: data.user.email ?? null,
          name: data.user.name ?? null,
          address: data.user.address ?? data.passport?.registration_address ?? null,
        }
      : undefined,
  })

  // локальные стейты редактирования
  const [isEditName, setIsEditName] = useState(false)
  const [isEditPhone, setIsEditPhone] = useState(false)
  const [isEditEmail, setIsEditEmail] = useState(false)
  const [isEditAddress, setIsEditAddress] = useState(false)

  // контролируемые значения
  const [fullName, setFullName]   = useState('')
  const [phone, setPhone]         = useState('')
  const [email, setEmail]         = useState<string | null>(null)
  const [address, setAddress]     = useState('')

  useEffect(() => {
    if (!data) return
    setFullName(data.user.name ?? '')
    setPhone(data.user.phone ?? '')
    setEmail(data.user.email ?? null)
    setAddress(data.user.address ?? data.passport?.registration_address ?? '')
    profileForm.setValue('name', data.user.name ?? null)
    profileForm.setValue('phone', data.user.phone ?? '')
    profileForm.setValue('email', data.user.email ?? null)
    profileForm.setValue('address', data.user.address ?? data.passport?.registration_address ?? null)
  }, [data, profileForm])

  // форматирование телефона в маску +7(XXX)XXX-XX-XX
  const formatPhone = (num: string): string => {
    const digitsOnly = (num || '').replace(/\D/g, '')
    const last10 = digitsOnly.slice(-10)
    if (last10.length !== 10) return num || ''
    const a = last10.slice(0, 3)
    const b = last10.slice(3, 6)
    const c = last10.slice(6, 8)
    const d = last10.slice(8, 10)
    return `+7(${a})${b}-${c}-${d}`
  }

  const profileMutation = useMutation<ClientDetail, unknown, ClientProfileUpdate>({
    mutationFn: (payload) => api.updateProfile(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })
  const passportMutation = useMutation<ClientDetail, unknown, PassportUpsert>({
    mutationFn: (payload) => api.upsertPassport(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const goBack = () => navigate(`/clients?tab=${returnTab}`)
  const goNext = () => navigate(`/clients/${clientId}/step/2?tab=${returnTab}`)

  // --- ensure single-edit mode ---
  const closeAllEdits = () => {
    setIsEditName(false)
    setIsEditPhone(false)
    setIsEditEmail(false)
    setIsEditAddress(false)
  }

  const resetValuesFromData = () => {
    if (!data) return
    setFullName(data.user.name ?? '')
    setPhone(data.user.phone ?? '')
    setEmail(data.user.email ?? null)
    setAddress(data.user.address ?? data.passport?.registration_address ?? '')
  }

  const openEdit = (which: 'name'|'phone'|'email'|'address') => {
    // при открытии нового редактирования — отменяем предыдущее и откатываем значения
    resetValuesFromData()
    closeAllEdits()
    switch (which) {
      case 'name': setIsEditName(true); break
      case 'phone': setIsEditPhone(true); break
      case 'email': setIsEditEmail(true); break
      case 'address': setIsEditAddress(true); break
    }
  }

  // универсальный saver для профиля
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

  const resetErrors = () => {
    setPhoneError(null)
    setEmailError(null)
    setAddressError(null)
  }

  const saveProfile = async (patch: Partial<ClientProfileUpdate>, field?: 'name' | 'phone' | 'email' | 'address') => {
    resetErrors()

    const resolvePhoneRaw = patch.phone !== undefined ? String(patch.phone ?? '') : String(phone ?? data?.user.phone ?? '')
    let normalizedPhone = resolvePhoneRaw.replace(/\D/g, '')
    if (!phonePattern.test(normalizedPhone)) {
      const fallbackPhone = String(data?.user.phone ?? '').replace(/\D/g, '')
      if (fallbackPhone && phonePattern.test(fallbackPhone)) {
        normalizedPhone = fallbackPhone
      } else if (patch.phone !== undefined) {
        setPhoneError('Номер должен содержать ровно 10 цифр')
        return
      }
    }

    const resolveEmail = patch.email !== undefined ? patch.email ?? '' : email ?? data?.user.email ?? ''
    if (patch.email !== undefined && resolveEmail && !emailPattern.test(resolveEmail)) {
      setEmailError('E-mail должен быть вида user@example.ru')
      return
    }

    const resolveAddress = patch.address !== undefined ? patch.address ?? '' : address ?? data?.passport?.registration_address ?? ''
    if (patch.address !== undefined && resolveAddress && !addressPattern.test(resolveAddress)) {
      setAddressError('Укажите населённый пункт и название (например, "г. Москва")')
      return
    }

    let normalizedAddress: string | null = null
    if (resolveAddress) {
      normalizedAddress = addressPattern.test(resolveAddress) ? resolveAddress : resolveAddress
    }

    const payload: ClientProfileUpdate = {
      name: (patch.name !== undefined ? patch.name : fullName) || null,
      phone: normalizedPhone,
      email: resolveEmail ? resolveEmail : null,
      address: normalizedAddress,
    }

    try {
      await profileMutation.mutateAsync(payload)
      setFullName(payload.name ?? '')
      setPhone(payload.phone)
      setEmail(payload.email)
      setAddress(payload.address ?? '')
      switch (field) {
        case 'name': setIsEditName(false); break
        case 'phone': setIsEditPhone(false); break
        case 'email': setIsEditEmail(false); break
        case 'address': setIsEditAddress(false); break
      }
    } catch (err) {
      console.error('update profile failed', err)
    }
  }

  const saveAddressToPassport = (addr: string) => {
    const p: PassportUpsert = {
      last_name: data?.passport?.last_name ?? null,
      first_name: data?.passport?.first_name ?? null,
      middle_name: data?.passport?.middle_name ?? null,
      series: data?.passport?.series ?? null,
      number: data?.passport?.number ?? null,
      issued_by: data?.passport?.issued_by ?? null,
      issue_code: data?.passport?.issue_code ?? null,
      issue_date: data?.passport?.issue_date ?? null,
      registration_address: addr || null,
      photo_url: data?.passport?.photo_url ?? null,
    }
    passportMutation.mutate(p)
  }

  if (isLoading) return <p className="clients__placeholder">Загружаем карточку клиента…</p>
  if (isError || !data) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось загрузить клиента.</p>
        <button type="button" onClick={() => refetch()}>Повторить</button>
      </div>
    )
  }

  return (
    <div className="page-blue">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Шаг 1 — Данные</h2>
        </div>

        <div className="step-modal__body">
          <ul className="info-list info-list--step">
            {/* Имя Фамилия */}
            <li className={`info-item info-item--step ${isEditName ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Имя Фамилия</div>
              {!isEditName ? (
                <div className="user-data__value user-data__value--gray">{fullName || '—'}</div>
              ) : (
                <input
                  className="input--inline"
                  value={fullName}
                  onChange={(e)=>setFullName(e.target.value)}
                  placeholder="Иван Иванов"
                />
              )}
              <div className="info-actions">
                <button type="button" className="icon-btn info-edit--step" aria-label="Редактировать" onClick={()=>openEdit('name')}>
                  <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                </button>
                <button type="button" className="icon-btn btn-save" aria-label="Сохранить" onClick={()=>{ saveProfile({ name: fullName || null }); setIsEditName(false); }}>
                  <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                </button>
                <button type="button" className="icon-btn btn-cancel" aria-label="Отменить" onClick={()=>{ setFullName(data.user.name ?? ''); setIsEditName(false); }}>
                  <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                </button>
              </div>
            </li>

            {/* Телефон */}
            <li className={`info-item info-item--step ${isEditPhone ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Телефон</div>
              {!isEditPhone ? (
                <div className="user-data__value user-data__value--gray">{phone ? formatPhone(phone) : '—'}</div>
              ) : (
                <input className="input--inline" value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" />
              )}
              <div className="info-actions">
                <button type="button" className="icon-btn info-edit--step" aria-label="Редактировать" onClick={()=>openEdit('phone')}>
                  <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                </button>
                <button type="button" className="icon-btn btn-save" aria-label="Сохранить" onClick={()=>{ saveProfile({ phone }); if (!phoneError) setIsEditPhone(false); }}>
                  <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                </button>
                <button type="button" className="icon-btn btn-cancel" aria-label="Отменить" onClick={()=>{ setPhone(data.user.phone ?? ''); setIsEditPhone(false); }}>
                  <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                </button>
              </div>
            </li>

            {/* Email */}
            <li className={`info-item info-item--step ${isEditEmail ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">E‑mail</div>
              {!isEditEmail ? (
                <div className="user-data__value user-data__value--gray">{email || '—'}</div>
              ) : (
                <input className="input--inline" value={email ?? ''} onChange={(e)=>setEmail(e.target.value)} placeholder="example@mail.ru" />
              )}
              <div className="info-actions">
                <button type="button" className="icon-btn info-edit--step" aria-label="Редактировать" onClick={()=>openEdit('email')}>
                  <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                </button>
                <button type="button" className="icon-btn btn-save" aria-label="Сохранить" onClick={()=>{ saveProfile({ email: email ?? null }); if (!emailError) setIsEditEmail(false); }}>
                  <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                </button>
                <button type="button" className="icon-btn btn-cancel" aria-label="Отменить" onClick={()=>{ setEmail(data.user.email ?? null); setIsEditEmail(false); }}>
                  <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                </button>
              </div>
            </li>

            {/* Адрес */}
            <li className={`info-item info-item--step ${isEditAddress ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Адрес</div>
              {!isEditAddress ? (
                <div className="user-data__value user-data__value--gray">{address || '—'}</div>
              ) : (
                <textarea className="input--inline" value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="г. Москва, ..." />
              )}
              <div className="info-actions">
                <button type="button" className="icon-btn info-edit--step" aria-label="Редактировать" onClick={()=>openEdit('address')}>
                  <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                </button>
                <button type="button" className="icon-btn btn-save" aria-label="Сохранить" onClick={()=>{ saveProfile({ address }); if (!addressError) { saveAddressToPassport(address); setIsEditAddress(false); } }}>
                  <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                </button>
                <button type="button" className="icon-btn btn-cancel" aria-label="Отменить" onClick={()=>{ setAddress(data.user.address ?? data.passport?.registration_address ?? ''); setIsEditAddress(false); }}>
                  <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                </button>
              </div>
            </li>
          </ul>
        </div>

        <div className="step-modal__footer">
          <button type="button" className="btn btn-blue" onClick={goBack}>Назад</button>
          <button type="button" className="btn btn-blue" onClick={goNext}>Далее</button>
        </div>
      </div>
    </div>
  )
}
