import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../../lib/use-api'
import PencilIcon from '../../assets/icons/pencil.svg'
import AcceptIcon from '../../assets/icons/accept.svg'
import CancelIcon from '../../assets/icons/cancel.svg'
import { resizeImage } from '../../lib/image'

type DeviceDraft = { title: string; device_type: string; description: string; purchase_date: string }
type DeviceField = 'title' | 'device_type' | 'description' | 'purchase_date'

function ClientStep3DeviceDetail() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId = '', deviceId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['client', clientId], [clientId])

  // Debug helper to trace clicks and payloads in DevTools
  const dbg = (...args: any[]) => { try { console.debug('[step3-device]', ...args) } catch {} }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })

  const device = data?.devices.find((d: any) => d.id === deviceId)

  // Нормализуем фото из API (поддержим разные поля, включая manager_device_photos)
  const devicePhotos: Array<{ id: string; url: string }> = useMemo(() => {
    const raw = (
      (device?.photos as any[] | undefined)
      ?? (device as any)?.manager_device_photos
      ?? []
    ) as any[]
    return raw
      .map((p) => {
        const id = String(p.id ?? p.photo_id ?? p.uuid ?? p.file_key ?? Math.random())
        const url = String(p.url ?? p.photo_url ?? p.public_url ?? p.path ?? p.file_url ?? '')
        return url ? { id, url } : null
      })
      .filter(Boolean) as Array<{ id: string; url: string }>
  }, [device])

  const [editingKey, setEditingKey] = useState<DeviceField | null>(null)
  const [draft, setDraft] = useState<DeviceDraft>(() => ({
    title: device?.title ?? '',
    device_type: device?.device_type ?? '',
    description: device?.description ?? '',
    purchase_date: (device?.specs?.purchase_date ?? '') as string,
  }))

  useEffect(() => {
  setDraft({
    title: device?.title ?? '',
    device_type: device?.device_type ?? '',
    description: device?.description ?? '',
    purchase_date: String(device?.specs?.purchase_date ?? ''),
  })
  }, [device?.id])

  const [saveError, setSaveError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!clientId || !deviceId) throw new Error('Missing clientId or deviceId')
      setSaveError(null)
      const anyApi = api as any
      dbg('mutationFn start', { clientId, deviceId, payload })
      const fn = anyApi.updateDevice || anyApi.updateClientDevice || anyApi.updateMasterDevice
      if (typeof fn !== 'function') {
        throw new Error('No API method: updateDevice/updateClientDevice/updateMasterDevice')
      }
      return fn(clientId, deviceId, payload)
    },
    onSuccess: async (res) => {
      dbg('mutation success', res)
      await queryClient.invalidateQueries({ queryKey })
      setEditingKey(null)
    },
    onError: (err: any) => {
      const msg = (err?.response?.data?.detail) || err?.message || 'Не удалось сохранить устройство'
      setSaveError(String(msg))
      dbg('mutation error', err)
      console.error('device update failed', err)
    },
  })

  // Локальные фото (для превью) + input
  const [localPhotos, setLocalPhotos] = useState<Array<{ id: string; url: string; blob?: Blob }>>([])
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null) 
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canAddMorePhotos = (devicePhotos.length + localPhotos.length) < 2

  useEffect(() => {
    // При смене устройства очищаем локальные превью
    setLocalPhotos([])
  }, [device?.id])

  const pickPhoto = () => {
    if (!canAddMorePhotos) return
    fileInputRef.current?.click()
  }

  const onAddPhotoChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingPhoto(true)
    try {
      const resized = await resizeImage(file, 1280)
      const processedFile = new File([resized.blob], resized.fileName || 'device.jpg', { type: resized.mimeType })
      await (api as any).addDevicePhoto(clientId, deviceId, processedFile, processedFile.name, processedFile.type)
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      console.error('device photo upload failed', err)
      const reader = new FileReader()
      reader.onload = () => setLocalPhotos((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), url: String(reader.result) }
      ])
      reader.readAsDataURL(file)
    } finally {
      setIsUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = async (photoId: string, isServer: boolean) => {
    const maybeAny = api as any
    if (isServer && typeof maybeAny.deleteDevicePhoto === 'function') {
      try {
        await maybeAny.deleteDevicePhoto(clientId, deviceId, photoId)
        await queryClient.invalidateQueries({ queryKey })
        return
      } catch (err) {
        console.error('delete photo failed', err)
      }
    }
    setLocalPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }

  const goBack = () => navigate(`/clients/${clientId}/step/3?tab=${returnTab}`)

  if (isLoading) return <p className="clients__placeholder">Загружаем устройство…</p>
  if (isError || !device) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось загрузить устройство.</p>
        <button type="button" onClick={() => refetch()}>Повторить</button>
      </div>
    )
  }

  const startEdit = (key: DeviceField) => {
    if (device) {
      setDraft({
        title: device.title ?? '',
        device_type: device.device_type ?? '',
        description: device.description ?? '',
        purchase_date: String(device.specs?.purchase_date ?? ''),
      })
    }
    setEditingKey(key)
  }

  const cancelEdit = () => {
    setDraft({
        title: device.title ?? '',
        device_type: device.device_type ?? '',
        description: device.description ?? '',
        purchase_date: String(device.specs?.purchase_date ?? ''),
    })
    setEditingKey(null)
  }
  const save = async () => {
    const payload: any = {
      title: (draft.title || null),
      device_type: (draft.device_type || null),
      description: (draft.description || null),
      ...(draft.purchase_date ? { specs: { purchase_date: draft.purchase_date } } : {}),
    }
    dbg('save clicked', { clientId, deviceId, payload })
    try {
      await updateMutation.mutateAsync(payload)
      await queryClient.invalidateQueries({ queryKey })
    } catch (e) {
      dbg('mutate threw', e)
      console.error('device update failed', e)
    }
  }

  return (
    <div className="page-blue step-wrapper">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Шаг 3 — Устройство</h2>
        </div>

        <div className="step-modal__body">
          <ul className="info-list info-list--step">
            {/* Тип */}
            <li className={`info-item info-item--step ${editingKey === 'device_type' ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Тип</div>

              {editingKey === 'device_type' ? (
                <div className="select-like-input" style={{ flex: 1 }}>
                  <select
                    value={draft.device_type}
                    onChange={(e) => setDraft((p) => ({ ...p, device_type: e.target.value }))}
                  >
                    <option value="">Выберите тип</option>
                    <option value="Телефон">Телефон</option>
                    <option value="Телевизор">Телевизор</option>
                    <option value="Планшет">Планшет</option>
                    <option value="Роутер">Роутер</option>
                    <option value="Холодильник">Холодильник</option>
                    <option value="Плита">Плита</option>
                    <option value="Варочная панель">Варочная панель</option>
                    <option value="Вытяжка">Вытяжка</option>
                    <option value="Духовка">Духовка</option>
                    <option value="Кондиционер">Кондиционер</option>
                  </select>
                </div>
              ) : (
                <div className="user-data__value user-data__value--gray">
                  {device.device_type || 'Нет данных'}
                </div>
              )}

              <div className="info-actions">
                <button
                  type="button"
                  className="icon-btn info-edit--step"
                  onClick={() => startEdit('device_type')}
                  aria-label="Редактировать"
                >
                  <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                </button>

                <button
                  type="button"
                  className="icon-btn btn-save"
                  onClick={save}
                  aria-label="Сохранить"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <div className="spinner" />
                  ) : (
                    <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                  )}
                </button>

                <button
                  type="button"
                  className="icon-btn btn-cancel"
                  onClick={cancelEdit}
                  aria-label="Отменить"
                  disabled={updateMutation.isPending}
                >
                  <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                </button>
              </div>
            </li>

            {/* Название */}
            <li className={`info-item info-item--step ${editingKey === 'title' ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Название</div>
              {editingKey === 'title' ? (
                <input
                  className="input input--inline"
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Модель устройства"
                />
              ) : (
                <div className="user-data__value user-data__value--gray">{device.title || 'Нет данных'}</div>
              )}
              <div className="info-actions">
                <button type="button" className="icon-btn info-edit--step" onClick={() => startEdit('title')} aria-label="Редактировать"><img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" /></button>
                <button
                  type="button"
                  className="icon-btn btn-save"
                  onClick={save}
                  aria-label="Сохранить"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <div className="spinner" />
                  ) : (
                    <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                  )}
                </button>                
                <button type="button" className="icon-btn btn-cancel" onClick={cancelEdit} aria-label="Отменить" disabled={updateMutation.isPending}><img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red"/></button>
              </div>
            </li>
            
            {/* Описание */}
            <li className={`info-item info-item--step ${editingKey === 'description' ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Описание</div>
              {editingKey === 'description' ? (
                <textarea
                  className="input input--inline"
                  value={draft.description}
                  onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Общее состояние, состояние батареи, серийные номера"
                  rows={3}
                />
              ) : (
                <div className="user-data__value user-data__value--gray">{device.description || 'Нет данных'}</div>
              )}
              <div className="info-actions">
                <button
                  type="button"
                  className="icon-btn info-edit--step"
                  onClick={() => startEdit('description')}
                  aria-label="Редактировать"
                >
                  <img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" />
                </button>
                <button
                  type="button"
                  className="icon-btn btn-save"
                  onClick={save}
                  aria-label="Сохранить"
                  disabled={updateMutation.isPending}
                >
                  <img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green" />
                </button>
                <button
                  type="button"
                  className="icon-btn btn-cancel"
                  onClick={cancelEdit}
                  aria-label="Отменить"
                >
                  <img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red" />
                </button>
              </div>
            </li>

            {/* Дата покупки */}
            <li className={`info-item info-item--step ${editingKey === 'purchase_date' ? 'is-editing' : ''}`}>
              <div className="user-data__label user-data__label--black">Дата покупки</div>
              {editingKey === 'purchase_date' ? (
                <input
                  className="input input--inline"
                  type="date"
                  value={draft.purchase_date ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, purchase_date: e.target.value }))}
                />
              ) : (
                <div className="user-data__value user-data__value--gray">
                  {device.specs?.purchase_date
                    ? new Date(String(device.specs.purchase_date)).toLocaleDateString('ru-RU')
                    : 'Нет данных'}
                </div>
              )}
              <div className="info-actions">
                <button type="button" className="icon-btn info-edit--step" onClick={() => startEdit('purchase_date')} aria-label="Редактировать"><img src={PencilIcon} alt="Редактировать" className="icon-btn__icon" /></button>
                <button type="button" className="icon-btn btn-save" onClick={save} aria-label="Сохранить" disabled={updateMutation.isPending}><img src={AcceptIcon} alt="Сохранить" className="icon-btn__icon icon-btn__icon--green"/></button>
                <button type="button" className="icon-btn btn-cancel" onClick={cancelEdit} aria-label="Отменить" disabled={updateMutation.isPending}><img src={CancelIcon} alt="Отменить" className="icon-btn__icon icon-btn__icon--red"/></button>
              </div>
            </li>
          </ul>
          <div className="device-photos">
            {device?.photos?.map((p, idx) => (
              <div key={p.id} className="device-photo">
                <button
                  type="button"
                  className="device-photo__remove"
                  onClick={() => removePhoto(p.id, devicePhotos.some(dp => dp.id === p.id))}
                  aria-label="Удалить фото"
                >×</button>
                <img
                  src={p.file_url}
                  alt="Фото устройства"
                  className="device-photo__img"
                  onClick={() => setViewerUrl(p.file_url)}
                />
              </div>
            ))}

            {isUploadingPhoto && (
              <div className="device-photo photo-tile--loading">
                <div className="spinner" />
              </div>
            )}

            {canAddMorePhotos && (
              <button type="button" className="device-photo device-photo--add" onClick={pickPhoto}>
                <svg
                  className="device-photo__plus"
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
              className="device-photo__file"
              onChange={onAddPhotoChange}
            />
          </div>

          {saveError && (
            <div className="clients__placeholder text-error" style={{ marginTop: 8 }}>
              {saveError}
            </div>
          )}
        </div>
        <footer className="step-modal__footer">
          <button
            type="button"
            className="btn btn-blue"
            onClick={goBack}
            disabled={updateMutation.isPending}
          >
            Назад
          </button>
          <button
            type="button"
            className="btn btn-blue"
            onClick={save}
            disabled={updateMutation.isPending}
          >
            Сохранить
          </button>
        </footer>
      </div>
        {viewerUrl && (
        <div className="photo-viewer" onClick={() => setViewerUrl(null)}>
          <img className="photo-viewer__img" src={viewerUrl} alt="Фото устройства" />
          <button className="photo-viewer__close" onClick={() => setViewerUrl(null)} aria-label="Закрыть">×</button>
        </div>
      )}
    </div>
  )
}

export default ClientStep3DeviceDetail
