import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../../lib/use-api'

function ClientStepSuccess() {
  const api = useApi()
  const navigate = useNavigate()
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnTab = searchParams.get('tab') ?? 'new'

  const queryKey = useMemo(() => ['client', clientId], [clientId])
  const { data } = useQuery({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })

  const goFinish = () => navigate(`/clients?tab=${returnTab}`)

  const tariffSnapshot = (data?.contract as any)?.tariff_snapshot ?? null
  const contractRequiresPayment = tariffSnapshot
    ? (tariffSnapshot.was_signed_before_regen
        ? Boolean(tariffSnapshot.device_added) && Number(tariffSnapshot.device_added_count || 0) > 0
        : Number(tariffSnapshot.total_extra_fee || 0) > 0)
    : false
  const needsInvoice = Boolean(
    (data?.invoices ?? []).some(
      (invoice) =>
        (invoice.status ?? '').toLowerCase() === 'pending' &&
        Boolean(data?.contract?.contract_number) &&
        invoice.contract_number === data?.contract?.contract_number &&
        contractRequiresPayment,
    ) && !(data?.contract?.payment_confirmed_at)
  )

  return (
    <div className="page-blue step-wrapper">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Готово</h2>
        </div>

        <section className="step-modal__body">
          <p className="step-success__text">
            {needsInvoice
              ? 'Договор подписан, все формальности соблюдены. В приложении клиента появился счёт, который нужно оплатить. С сегодняшнего дня ваш дом под нашей защитой, а доп опции включатся после оплаты.'
              : 'Договор подписан, все формальности соблюдены. С сегодняшнего дня ваш дом под нашей защитой.'}
          </p>
        </section>

        <footer className="step-modal__footer">
          <button type="button" className="btn btn-blue" onClick={goFinish}>
            Закончить
          </button>
        </footer>
      </div>
    </div>
  )
}

export default ClientStepSuccess
