import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../../lib/use-api'
import type { ClientDetail, DeviceCreate } from '../../lib/api-client'

import { resizeImage } from '../../lib/image'

function ClientStep3AddDevice() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['client', clientId], [clientId])
  const { isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })

  const [title, setTitle] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [description, setDescription] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')

  const [photos, setPhotos] = useState<Array<{ preview: string; blob: Blob }>>([])
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canAddMorePhotos = photos.length < 2

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
      const reader = new FileReader()
      reader.onload = () => {
        setPhotos(prev => [...prev, { preview: String(reader.result), blob: resized.blob }].slice(0, 2))
      }
      reader.readAsDataURL(resized.blob)
    } catch (err) {
      console.error('add photo failed', err)
    } finally {
      setIsUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const createDeviceMutation = useMutation({
    mutationFn: (payload: DeviceCreate) => api.createDevice(clientId, payload),
    onError: (err) => {
      console.error('createDevice failed', err)
    },
  })

    const handleSave = async () => {
      // ✅ валидируем и нормализуем поля устройства
      const safeDeviceType = (deviceType || '').trim() || 'Телефон'
      const safeTitle = (title || '').trim()
      if (!safeTitle) {
        alert('Заполните «Модель» (название устройства)')
        return
      }

      const payload: DeviceCreate = {
        title: safeTitle,
        device_type: safeDeviceType,
        description: (description || '').trim() || null,
        specs: purchaseDate ? { purchase_date: purchaseDate } : null,
        extra_fee: 0,
      }

    try {
      const created: any = await createDeviceMutation.mutateAsync(payload)

      // Пытаемся получить id нового устройства
      let newDeviceId: string | undefined = created?.id ?? created?.device?.id

      // Если API не вернул id, попробуем перечитать клиента и взять устройство с таким же названием (best-effort)
      if (!newDeviceId) {
        try {
          const detail: ClientDetail = await api.getClient(clientId)
          const maybe = detail.devices?.find((d: any) => d.title === title)
          newDeviceId = maybe?.id
        } catch (e) {
          console.warn('Fallback getClient failed', e)
        }
      }

      if (newDeviceId && photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i]
          const fileName = `${title || 'device'}_${i + 1}.jpg`
          try {
            // 1) Загружаем файл на бэк, получаем file_key
            const form = new FormData()
            form.append('file', new File([p.blob], fileName, { type: 'image/jpeg' }))

            const up = await fetch('/api/manager/uploads/direct', {
              method: 'POST',
              body: form,
            })
            if (!up.ok) throw new Error(`direct upload failed: ${up.status}`)
            const upJson: any = await up.json()
            const file_key: string = upJson.file_key
            if (!file_key) throw new Error('no file_key from direct upload')

            // 2) Привязываем фото к устройству
            const attach = await fetch(
              `/api/manager/clients/${clientId}/devices/${newDeviceId}/photos`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_key }),
              }
            )
            if (!attach.ok) throw new Error(`attach failed: ${attach.status}`)
          } catch (err) {
            console.error('addDevicePhoto via direct upload failed', err)
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey })
      navigate(`/clients/${clientId}/step/3?tab=${returnTab}`)
    } catch (err) {
      console.error('save with photos failed', err)
    }
  }

  const goBack = () => navigate(`/clients/${clientId}/step/3?tab=${returnTab}`)
  const busy = createDeviceMutation.isPending || isUploadingPhoto

  if (isLoading) {
    return <p className="clients__placeholder">Загружаем…</p>
  }
  if (isError) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось загрузить данные клиента.</p>
        <button type="button" onClick={() => refetch()}>Повторить</button>
      </div>
    )
  }

  return (
    <div className="page-blue step-wrapper">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Шаг 3 — Добавить устройство</h2>
        </div>

        <section className="step-modal__body">
          <div className="device-form">
            <label className="device-form__field">
              Тип
              <div className="select-like-input">
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
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
            </label>

            <label className="device-form__field">
              Модель
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Samsung QE55Q60"
              />
            </label>

            <label className="device-form__field">
              Описание
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Общее состояние, состояние батареи, серийные номера "
              />
            </label>

            <label className="device-form__field">
              Дата покупки
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </label>
          </div>
          <div className="device-photos">
            {photos.map((p, idx) => (
              <div key={idx} className="device-photo">
                <button
                  type="button"
                  className="device-photo__remove"
                  onClick={() => removePhoto(idx)}
                  aria-label="Удалить фото"
                >×</button>
                <img
                  src={p.preview}
                  alt={`Фото устройства ${idx + 1}`}
                  className="device-photo__img"
                  onClick={() => setViewerUrl(p.preview)}
                />
              </div>
            ))}

            {isUploadingPhoto && (
              <div className="device-photo photo-tile--loading"><div className="spinner"/></div>
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
        </section>

        <footer className="step-modal__footer">
          <button
            type="button"
            className="btn btn-blue"
            onClick={goBack}
            disabled={busy}
          >
            {busy ? <div className="spinner" /> : 'Назад'}
          </button>
          <button
            type="button"
            className="btn btn-blue"
            onClick={handleSave}
            disabled={busy || !title}
          >
            {busy ? <div className="spinner" /> : 'Добавить'}
          </button>
        </footer>
      </div>
      {viewerUrl && (
      <div className="photo-viewer" onClick={() => setViewerUrl(null)}>
        <img className="photo-viewer__img" src={viewerUrl} alt="Фото" />
        <button className="photo-viewer__close" onClick={() => setViewerUrl(null)} aria-label="Закрыть">×</button>
      </div>
    )}
    </div>
  )
}

export default ClientStep3AddDevice
