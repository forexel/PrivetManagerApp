import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../../lib/use-api'
import type { ClientDetail } from '../../lib/api-client'

function ClientStep3Devices() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['client', clientId], [clientId])
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })
  const deleteDeviceMutation = useMutation<ClientDetail, unknown, string>({
    mutationFn: (deviceId: string) => api.deleteDevice(clientId, deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const handleDelete = async (deviceId: string) => {
    if (!window.confirm('Удалить устройство?')) return
    try {
      await deleteDeviceMutation.mutateAsync(deviceId)
    } catch (err) {
      console.error('delete device failed', err)
    }
  }

  const goBack = () => navigate(`/clients/${clientId}/step/2?tab=${returnTab}`)
  const goNext = () => {
    const signedAt = data?.contract?.signed_at ? new Date(data.contract.signed_at).getTime() : 0
    const hasDeviceChanges = (data?.devices ?? []).some((device) => {
      const updated = new Date(device.updated_at).getTime()
      return signedAt === 0 ? true : updated > signedAt
    })

    // если договор уже подписан и ничего не менялось — ребилд не нужен
    const needRegen = !data?.contract?.signed_at ? true : hasDeviceChanges

    const intent = needRegen ? 'regen' : 'view'
    navigate(`/clients/${clientId}/step/4?tab=${returnTab}&intent=${intent}`)

    if (!needRegen) return

    ;(async () => {
      try {
        const deviceCount = data?.devices?.length ?? 0
        await api.calculateTariff(clientId, { device_count: deviceCount })
        await api.applyTariff(clientId, { device_count: deviceCount })
        queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      } catch (e) {
        console.error('Tariff apply (background) failed', e)
      }
    })()
  }

  if (isLoading) {
    return <p className="clients__placeholder">Загружаем устройства…</p>
  }

  if (isError || !data) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось получить данные клиента.</p>
        <button type="button" onClick={() => refetch()}>Повторить</button>
      </div>
    )
  }

  return (
    <div className="page-blue step-wrapper">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Шаг 3 — Устройства</h2>
        </div>

        <section className="step-modal__body">
          <ul className="device-list">
            {data.devices.map((device) => (
              <li
                key={device.id}
                className="device-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/clients/${clientId}/step/3/device/${device.id}?tab=${returnTab}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    navigate(`/clients/${clientId}/step/3/device/${device.id}?tab=${returnTab}`)
                  }
                }}
              >
                <div className="device-card__info">
                  <span className="device-card__title">{device.title}</span>
                  <span className="device-card__meta">
                    зарегистрирован {new Date(device.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <button
                  type="button"
                  className="device-card__remove"
                  aria-label={`Удалить устройство ${device.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDelete(device.id)
                  }}
                  disabled={deleteDeviceMutation.isPending}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          
          <button
            type="button"
            className="device-add"
            onClick={() => navigate(`/clients/${clientId}/step/3/add?tab=${returnTab}`)}
          >
            + Добавить устройство
          </button>
        </section>

        <footer className="step-modal__footer">
          <button type="button" className="btn btn-blue" onClick={goBack}>
            Назад
          </button>
          <button type="button" className="btn btn-blue" onClick={goNext}>
            Далее
          </button>
        </footer>
      </div>
    </div>
  )
}

export default ClientStep3Devices
