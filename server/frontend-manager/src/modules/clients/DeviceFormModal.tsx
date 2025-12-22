import { useState } from 'react'

type DeviceFormModalProps = {
  onClose: () => void
  onSubmit: (payload: DeviceFormValues) => void
  isSubmitting?: boolean
}

export type DeviceFormValues = {
  title: string
  device_type: string
  purchase_date: string
  description: string
}

const DEVICE_TYPES = ['телефон', 'телевизор', 'роутер', 'холодильник', 'плита', 'духовка', 'прочее']

function DeviceFormModal({ onClose, onSubmit, isSubmitting }: DeviceFormModalProps) {
  const [values, setValues] = useState<DeviceFormValues>({
    title: '',
    device_type: DEVICE_TYPES[0],
    purchase_date: '',
    description: '',
  })

  const handleChange = (key: keyof DeviceFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((prev) => ({ ...prev, [key]: event.target.value }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(values)
  }

  return (
    <div className="page-blue step-wrapper">
      <div className="step-modal">
        <header className="step-modal__header">
          <h1 className="step-modal__title">Описание</h1>
          <button type="button" className="step-modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <form className="device-form" onSubmit={handleSubmit}>
          <label className="device-form__field">
            <span>Название</span>
            <input type="text" value={values.title} onChange={handleChange('title')} placeholder="Iphone 14 Pro" required />
          </label>

          <label className="device-form__field">
            <span>Тип устройства</span>
            <select value={values.device_type} onChange={handleChange('device_type')}>
              {DEVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="device-form__field">
            <span>Месяц/год покупки</span>
            <input type="month" value={values.purchase_date} onChange={handleChange('purchase_date')} />
          </label>

          <label className="device-form__field">
            <span>Подробное описание</span>
            <textarea value={values.description} onChange={handleChange('description')} placeholder="Опишите устройство" rows={4} />
          </label>

          <div className="device-form__actions">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Добавляем…' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DeviceFormModal
