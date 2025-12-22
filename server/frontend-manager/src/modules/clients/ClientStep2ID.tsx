import { useMemo, useRef, useState } from "react"
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import PencilIcon from '../../assets/icons/pencil.svg'
import AcceptIcon from '../../assets/icons/accept.svg'
import CancelIcon from '../../assets/icons/cancel.svg'
import { useApi } from '../../lib/use-api'
import { resizeImage } from '../../lib/image'
import type { ClientDetail, PassportUpsert, ManagerProfile } from '../../lib/api-client'

// type-guards for optional API methods
const has = (obj: any, name: string) => typeof obj?.[name] === 'function'

const FALLBACK_TEXT = 'Нет данных'

type PassportField =
  | 'series_number'
  | 'issued_by'
  | 'issue_date'
  | 'issue_code'
  | 'registration_address'

type FieldConfig = {
  key: PassportField
  label: string
  placeholder?: string
}

const PASSPORT_FIELDS: FieldConfig[] = [
  { key: 'series_number', label: 'Серия и номер', placeholder: '1234 567890' },
  { key: 'issued_by', label: 'Кем выдан', placeholder: 'ОВД района…' },
  { key: 'issue_date', label: 'Когда выдан', placeholder: 'дата' },
  { key: 'issue_code', label: 'Код подразделения', placeholder: '770-001' },
  { key: 'registration_address', label: 'Адрес регистрации', placeholder: 'г. Москва…' },
]

function ClientStep2ID() {
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
  const { data: profile } = useQuery({
    queryKey: ['manager', 'me'],
    queryFn: () => api.getManagerProfile(),
  })

  const [editingKey, setEditingKey] = useState<PassportField | null>(null)
  const [formState, setFormState] = useState<PassportUpsert | null>(null)
  const [seriesNumber, setSeriesNumber] = useState(() => {
    const series = data?.passport?.series ?? ''
    const number = data?.passport?.number ?? ''
    return [series, number].filter(Boolean).join(' ')
  })

  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)

  // Current persisted photo URL (prefer main, fallback to public_url/file_url)
  const passportPhotoUrl: string | null = (data?.passport?.photo_url
    ?? (data as any)?.passport?.public_url
    ?? (data as any)?.passport?.file_url
    ?? null) as string | null

  const pickPhoto = () => fileInputRef.current?.click()

  const onPhotoChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingPhoto(true)
    try {
      const resized = await resizeImage(file, 1280)
      const processedFile = new File([resized.blob], resized.fileName || 'passport.jpg', { type: resized.mimeType })
      await (api as any).updatePassportPhoto(clientId, processedFile, processedFile.name, processedFile.type)
      await queryClient.invalidateQueries({ queryKey })
      setPhotoPreview(null)
    } catch (err) {
      console.error('passport photo upload failed', err)
      const reader = new FileReader()
      reader.onload = () => setPhotoPreview(String(reader.result ?? ''))
      reader.readAsDataURL(file)
    } finally {
      setIsUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onRemovePhoto = async () => {
    try {
      const anyApi = api as any
      if (has(anyApi, 'deletePassportPhoto')) {
        await anyApi.deletePassportPhoto(clientId)
      } else if (has(anyApi, 'updatePassportPhoto')) {
        await anyApi.updatePassportPhoto(clientId, { file_key: null })
      } else if (has(anyApi, 'upsertPassport')) {
        await anyApi.upsertPassport(clientId, { photo_file_key: null, photo_url: null })
      }
      await queryClient.invalidateQueries({ queryKey })
      setPhotoPreview(null)
    } catch (err) {
      console.error('passport photo remove failed', err)
      setPhotoPreview(null)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const updateDetailCache = (detail: ClientDetail) => {
    queryClient.setQueryData<ClientDetail>(queryKey, detail)
    queryClient.invalidateQueries({ queryKey: ['clients'] })
  }

  const passportMutation = useMutation<ClientDetail, unknown, PassportUpsert>({
    mutationFn: (payload) => api.upsertPassport(clientId, payload),
    onSuccess: (detail) => updateDetailCache(detail),
  })

  const goBack = () => navigate(`/clients/${clientId}/step/1?tab=${returnTab}`)
  const goNext = () => navigate(`/clients/${clientId}/step/3?tab=${returnTab}`)

  if (isLoading) {
    return <p className="clients__placeholder">Загружаем паспорт…</p>
  }

  if (isError || !data) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось загрузить паспорт.</p>
        <button type="button" onClick={() => refetch()}>Повторить</button>
      </div>
    )
  }

  const currentPassport: PassportUpsert = {
    last_name: data.passport?.last_name ?? null,
    first_name: data.passport?.first_name ?? null,
    middle_name: data.passport?.middle_name ?? null,
    series: data.passport?.series ?? null,
    number: data.passport?.number ?? null,
    issued_by: data.passport?.issued_by ?? null,
    issue_code: data.passport?.issue_code ?? null,
    issue_date: data.passport?.issue_date ?? null,
    registration_address: data.passport?.registration_address ?? null,
  }

  const startEdit = (key: PassportField) => {
    setEditingKey(key)
    const snapshot = formState ?? currentPassport
    if (key === 'series_number') {
      const combined = [snapshot.series ?? '', snapshot.number ?? ''].filter(Boolean).join(' ')
      setSeriesNumber(combined)
    }
    if (!formState) {
      setFormState(snapshot)
    }
  }

  const cancelEdit = () => {
    setFormState(currentPassport)
    setSeriesNumber([currentPassport.series ?? '', currentPassport.number ?? ''].filter(Boolean).join(' '))
    setEditingKey(null)
  }

  const handleFieldChange = (key: PassportField, value: string) => {
    if (key === 'series_number') {
      const normalized = value.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '').toUpperCase()
      const series = normalized.slice(0, 4)
      const number = normalized.slice(4, 10)
      const display = [series, number].filter(Boolean).join(' ')
      setSeriesNumber(display)
      setFormState((prev) => ({
        ...(prev ?? currentPassport),
        series,
        number,
      }))
      return
    }
    if (key === 'issue_code') {
      const digits = value.replace(/\D/g, '').slice(0, 6)
      const formatted = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits
      setFormState((prev) => ({
        ...(prev ?? currentPassport),
        issue_code: formatted,
      }))
      return
    }
    const sanitized = value
    if (key === 'issue_date') {
      setFormState((prev) => ({ ...prev ?? currentPassport, issue_date: value }))
      return
    }
    if (key === 'issued_by') {
      setFormState((prev) => ({ ...prev ?? currentPassport, issued_by: value }))
      return
    }
    if (key === 'registration_address') {
      setFormState((prev) => ({ ...prev ?? currentPassport, registration_address: value }))
      return
    }
    setFormState((prev) => ({ ...prev ?? currentPassport, [key]: sanitized }))
  }

  const handleSave = async () => {
    if (!formState) return
    const payload: PassportUpsert = {
      ...formState,
      middle_name: formState.middle_name ?? null,
      last_name: formState.last_name ?? null,
      first_name: formState.first_name ?? null,
      registration_address: formState.registration_address ?? null,
    }
    await passportMutation.mutateAsync(payload)
    setEditingKey(null)
    setFormState(null)
  }

  const getDisplayValue = (key: PassportField): string => {
    if (key === 'series_number') {
      const series = currentPassport.series ?? ''
      const number = currentPassport.number ?? ''
      const combined = [series, number].filter(Boolean).join(' ')
      return combined || FALLBACK_TEXT
    }
    if (key === 'issue_date') {
      const value = currentPassport.issue_date
      if (!value) return FALLBACK_TEXT
      return new Date(value).toLocaleDateString('ru-RU')
    }
    const value =
      key === 'issued_by' ? currentPassport.issued_by
      : key === 'issue_code' ? currentPassport.issue_code
      : key === 'registration_address' ? currentPassport.registration_address
      : null
    return value ? String(value) : FALLBACK_TEXT
  }

  return (
    <div className="page-blue">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Шаг 2 — Паспорт</h2>
        </div>

        <div className="step-modal__body">
          <ul className="info-list info-list--step">
            {PASSPORT_FIELDS.map(({ key, label, placeholder }) => {
              const isEditing = editingKey === key
              const state = formState ?? currentPassport

              return (
                <li key={key} className={`info-item info-item--step ${isEditing ? 'is-editing' : ''}`}>
                  <div className="user-data__label user-data__label--black">{label}</div>
                  {!isEditing ? (
                    <div className="user-data__value user-data__value--gray">{getDisplayValue(key)}</div>
                  ) : key === 'series_number' ? (
                    <input
                      className="input input--passport input--inline"
                      value={seriesNumber}
                      onChange={(event) => handleFieldChange('series_number', event.target.value)}
                      placeholder={placeholder}
                    />
                  ) : key === 'issued_by' ? (
                    <textarea
                      className="input input--passport input--inline"
                      value={state.issued_by ?? ''}
                      onChange={(event) => handleFieldChange('issued_by', event.target.value)}
                      placeholder={placeholder}
                    />
                  ) : key === 'registration_address' ? (
                    <textarea
                      className="input input--passport input--inline"
                      value={state.registration_address ?? ''}
                      onChange={(event) => handleFieldChange('registration_address', event.target.value)}
                      placeholder={placeholder}
                    />
                  ) : key === 'issue_date' ? (
                    <input
                      className="input input--passport input--inline"
                      type="date"
                      value={state.issue_date ?? ''}
                      onChange={(event) => handleFieldChange('issue_date', event.target.value)}
                      placeholder={placeholder}
                    />
                  ) : (
                    <input
                      className="input input--passport input--inline"
                      value={(key === 'issue_code' ? state.issue_code : (state[key] as string | null)) ?? ''}
                      onChange={(event) => handleFieldChange(key, event.target.value)}
                      placeholder={placeholder}
                    />
                  )}

                  <div className="info-actions">
                    <button
                      type="button"
                      className="icon-btn info-edit--step"
                      onClick={() => startEdit(key)}
                      disabled={passportMutation.isPending}
                      aria-label="Редактировать"
                    >
                      <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn btn-save"
                      aria-label="Сохранить"
                      disabled={passportMutation.isPending}
                      onClick={() => { void handleSave(); }}
                    >
                      {passportMutation.isPending ? (
                        <div className="spinner" />
                      ) : (
                        <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="icon-btn btn-cancel"
                      onClick={cancelEdit}
                      disabled={passportMutation.isPending}
                      aria-label="Отменить"
                    >
                      <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                    </button>
                  </div>
                </li>
              )
            })}
         </ul>
          <div className="passport-photo-card">
            {isUploadingPhoto && (
              <div className="device-photo photo-tile--loading" style={{ marginBottom: 8 }}>
                <div className="spinner" />
              </div>
            )}
            {(passportPhotoUrl || photoPreview) ? (
              <>
                <button type="button" className="passport-photo-card__remove" onClick={onRemovePhoto} aria-label="Удалить фото">×</button>
                <img
                  src={(photoPreview ?? passportPhotoUrl)!}
                  alt="Паспортное фото"
                  className="passport-photo-card__img"
                  onClick={() => setViewerUrl((photoPreview ?? passportPhotoUrl)!)}
                />
              </>
            ) : (
              <button type="button" className="passport-photo-card__add" onClick={pickPhoto}>
                <svg
                  className="passport-photo-card__plus"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Добавить фото</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="passport-photo-card__file"
              onChange={onPhotoChange}
            />
          </div>

        </div>

        <div className="step-modal__footer">
          <button type="button" className="btn btn-blue" onClick={goBack}>Назад</button>
          <button type="button" className="btn btn-blue" onClick={goNext}>Далее</button>
        </div>
      </div>
      {viewerUrl && (
        <div className="photo-viewer" onClick={() => setViewerUrl(null)}>
          <img className="photo-viewer__img" src={viewerUrl} alt="Паспортное фото" />
          <button className="photo-viewer__close" onClick={() => setViewerUrl(null)} aria-label="Закрыть">×</button>
        </div>
      )}
    </div>
  )
}

export default ClientStep2ID
