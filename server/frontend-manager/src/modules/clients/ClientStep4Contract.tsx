import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/use-api'
import type { ClientDetail, ContractGenerateResponse } from '../../lib/api-client'

type Step4State =
  | { status: 'loading' }
  | { status: 'skip'; needsInvoice: boolean }          // есть подписанный договор и изменений нет
  | { status: 'await_sign' }                            // договор есть, изменений нет, НО он не подписан — ждём ввод OTP
  | { status: 'generate'; signature: string }           // нужно сгенерировать новый

// --- helper: normalize values for stable JSON compare (null/undefined/"" become "")
const normalize = (v: any): any => {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.map(normalize)
  if (typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .sort(([keyA], [keyB]) => String(keyA).localeCompare(String(keyB)))
        .map(([k, val]) => [k, normalize(val)]),
    )
  }
  return v
}

const canonicalPassport = (snapshot: any): any => {
  if (!snapshot) return null
  return normalize({
    last_name: snapshot.last_name || '',
    first_name: snapshot.first_name || '',
    middle_name: snapshot.middle_name || '',
    series: snapshot.series || '',
    number: snapshot.number || '',
    issued_by: snapshot.issued_by || '',
    issue_code: snapshot.issue_code || '',
    issue_date: snapshot.issue_date || '',
    registration_address: snapshot.registration_address || '',
    phone: snapshot.phone || '',
    email: snapshot.email || '',
    name: snapshot.name || '',
    address: snapshot.address || '',
  })
}

const canonicalDevices = (collection: any[]): any[] => {
  if (!Array.isArray(collection)) return []
  return collection
    .map((d) =>
      normalize({
        id: String(d.id || ''),
        device_type: d.device_type || '',
        title: d.title || '',
        description: d.description || '',
        specs: d.specs || {},
        extra_fee: Number(d.extra_fee || 0),
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
}

const canonicalTariff = (src: any): any => {
  if (!src) return null
  return normalize({
    tariff_id: src.tariff_id ? String(src.tariff_id) : null,
    device_count: Number(src.device_count || 0),
    total_extra_fee: Number(src.total_extra_fee || 0),
    extra_per_device: Number(src.extra_per_device || 0),
    base_fee: Number(src.base_fee || 0),
    name: src.name || '',
    client_full_name: src.client_full_name || '',
  })
}

const DOTS_MAX = 5

function ClientStep4Contract() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const intent = searchParams.get('intent') // 'view' | 'regen' | null
  const returnTab = searchParams.get('tab') ?? 'new'

  const [otp, setOtp] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [dots, setDots] = useState(0)
  const [stepState, setStepState] = useState<Step4State>({ status: 'loading' })
  const [newNumber, setNewNumber] = useState<string | null>(null)
  const [awaitingFreshContract, setAwaitingFreshContract] = useState(false)

  const signatureRef = useRef<string>('')
  const _justGeneratedRef = useRef(false)
  const oldContractRef = useRef<{ number?: string; url?: string } | null>(null)
  const _stableSignatureRef = useRef<string | null>(null)

// --- Хелпер для короткой подписи договора (на уровне модуля) ---
const getShortContractLabel = (num?: string, data?: ClientDetail) => {
  if (!num) return ''
  // Если уже короткий формат: AA-YYMMDD(-NN) — возвращаем как есть
  if (/^[A-Za-zА-Яа-яЁё]{2}-\d{6}(?:-\d{2})?$/.test(num)) return num
  // Старый формат CTR-YYYYMMDD-... → строим AA-YYMMDD
  const m = num.match(/CTR-(\d{8})/)
  const yymmdd = m ? m[1].slice(2) : ''
  const lastName = ((data as any)?.passport?.last_name as string) || ((data?.user?.name || '').split(' ').slice(-1)[0] || '')
  const two = lastName.trim().toUpperCase().slice(0, 2) || 'XX'
  return yymmdd ? `${two}-${yymmdd}` : num
}

  const generateMutation = useMutation<ContractGenerateResponse>({
    mutationFn: async () => {
      setErrorMsg(null)
      return await api.generateContract(clientId)
    },
    onSuccess: (result) => {
      const previousNumber = oldContractRef.current?.number ?? null
      const nextNumber = result?.contract_number ?? null
      const detail = queryClient.getQueryData<ClientDetail>(queryKey)
      const signed = Boolean(detail?.contract?.signed_at)
      const tariffSnapshot = (detail?.contract as any)?.tariff_snapshot ?? null
      const contractRequiresPayment = tariffSnapshot
        ? (tariffSnapshot.was_signed_before_regen
            ? Boolean(tariffSnapshot.device_added) && Number(tariffSnapshot.device_added_count || 0) > 0
            : Number(tariffSnapshot.total_extra_fee || 0) > 0)
        : false
      const hasPendingInvoice = (detail?.invoices ?? []).some(
        (invoice) =>
          (invoice.status ?? '').toLowerCase() === 'pending' &&
          Boolean(detail?.contract?.contract_number) &&
          invoice.contract_number === detail?.contract?.contract_number &&
          contractRequiresPayment,
      )

      if (!nextNumber || nextNumber === previousNumber) {
        _justGeneratedRef.current = false
        setAwaitingFreshContract(false)
        oldContractRef.current = null
        _stableSignatureRef.current = signatureRef.current || null
        setStepState(signed ? { status: 'skip', needsInvoice: hasPendingInvoice } : { status: 'await_sign' })
      } else {
        _justGeneratedRef.current = true
        _stableSignatureRef.current = null
        setAwaitingFreshContract(true)
      }

      queryClient.invalidateQueries({ queryKey })
    },
    onError: () => {
      setAwaitingFreshContract(false)
      setErrorMsg('Не удалось сгенерировать договор. Попробуйте ещё раз.')
    },
  })

  useEffect(() => {
    if (stepState.status === 'generate') {
      setDots(0)
      const timer = setInterval(() => {
        setDots((current) => ((current + 1) % (DOTS_MAX + 1)))
      }, 500)
      return () => clearInterval(timer)
    }
    // для всех прочих состояний сбрасываем точки
    setDots(0)
  }, [stepState.status])

  // --- Эффект таймера cooldown (на уровне модуля, после эффекта для точек) ---
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // kick generation only once when we moved to `generate` state
  useEffect(() => {
    if (stepState.status !== 'generate') return;
    if (awaitingFreshContract) return; // already in progress
    setAwaitingFreshContract(true);
    generateMutation.mutateAsync().finally(() => {
      setAwaitingFreshContract(false);
    });
  }, [stepState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const queryKey = useMemo(() => ['client', clientId], [clientId])
  const { data, isLoading, isError, refetch } = useQuery<ClientDetail>({
    queryKey,
    queryFn: () => api.getClient(clientId),
    enabled: Boolean(clientId),
  })

  const contractNumber = data?.contract?.contract_number ? String(data.contract.contract_number) : null

  const updateCache = (detail: ClientDetail) => {
    queryClient.setQueryData<ClientDetail>(queryKey, (old) => {
      if (!old) return detail
      return {
        ...old,
        ...detail,
        user: (detail as any).user ?? old.user,
        passport: (detail as any).passport ?? old.passport,
        devices: (detail as any).devices ?? old.devices,
        tariff: (detail as any).tariff ?? old.tariff,
        contract: (detail as any).contract ?? old.contract,
        invoices: (detail as any).invoices ?? old.invoices,
        status: (detail as any).status ?? (old as any).status,
        assigned_manager_id: (detail as any).assigned_manager_id ?? (old as any).assigned_manager_id,
        support_ticket_id: (detail as any).support_ticket_id ?? (old as any).support_ticket_id,
      }
    })
  }

  useEffect(() => {
    if (!clientId) return
    if (!data) return
    const currentPassportCanonical = canonicalPassport({
      last_name: data.passport?.last_name,
      first_name: data.passport?.first_name,
      middle_name: data.passport?.middle_name,
      series: data.passport?.series,
      number: data.passport?.number,
      issued_by: data.passport?.issued_by,
      issue_code: data.passport?.issue_code,
      issue_date: data.passport?.issue_date,
      registration_address: data.passport?.registration_address,
      phone: data.user?.phone,
      email: data.user?.email,
      name: data.user?.name,
      address: data.user?.address,
    })

    const snapPassportRaw = (data.contract as any)?.passport_snapshot
    const snapPassport =
      snapPassportRaw === undefined || snapPassportRaw === null
        ? currentPassportCanonical
        : canonicalPassport(snapPassportRaw)

    const currentDevicesCanonical = canonicalDevices(
      (data.devices ?? []).map((device) => ({
        id: device.id,
        device_type: device.device_type,
        title: device.title,
        description: device.description,
        specs: device.specs || {},
        extra_fee: Number(device.extra_fee ?? 0),
      })),
    )

    const snapDevicesRaw = (data.contract as any)?.device_snapshot
    const snapDevices =
      snapDevicesRaw === undefined || snapDevicesRaw === null
        ? currentDevicesCanonical
        : canonicalDevices(Array.isArray(snapDevicesRaw) ? snapDevicesRaw : [])

    const currentTariffCanonical = canonicalTariff(
      data.tariff && {
        tariff_id: data.tariff.tariff_id ? String(data.tariff.tariff_id) : null,
        device_count: Number(data.tariff.device_count ?? 0),
        total_extra_fee: Number(data.tariff.total_extra_fee ?? 0),
        extra_per_device: Number(data.tariff.extra_per_device ?? 0),
        base_fee: Number((data.tariff as any).base_fee ?? 0),
        name: (data.tariff as any).name,
        client_full_name: data.user?.name ?? '',
      },
    )

    const snapTariffRaw = (data.contract as any)?.tariff_snapshot
    const snapTariffSeed = snapTariffRaw
      ? {
          ...snapTariffRaw,
          client_full_name:
            (snapTariffRaw as any).client_full_name ?? data.user?.name ?? '',
        }
      : snapTariffRaw
    const snapTariff =
      snapTariffSeed === undefined || snapTariffSeed === null
        ? currentTariffCanonical
        : canonicalTariff(snapTariffSeed)

    // --- Decide target state (no extra transitional screens) ---
    const hasContract = Boolean(data.contract?.contract_number)
    const signed = Boolean(data.contract?.signed_at)

    // diff snapshots vs current; если снапшотов нет — выше мы уже подставили текущие
    const hasChangesAfterContract =
      JSON.stringify(currentPassportCanonical) !== JSON.stringify(snapPassport) ||
      JSON.stringify(currentDevicesCanonical)  !== JSON.stringify(snapDevices)  ||
      JSON.stringify(currentTariffCanonical)   !== JSON.stringify(snapTariff)

    // регенерируем ТОЛЬКО когда есть уже подписанный договор и что-то поменялось
    const shouldRegen = Boolean(hasContract && signed && hasChangesAfterContract)

    // сохраняем «старый договор», чтобы показать его при регенерации
    if (hasContract && signed) {
      oldContractRef.current = {
        number: data.contract?.contract_number || undefined,
        url: data.contract?.contract_url || undefined,
      }
    } else {
      oldContractRef.current = null
    }

    if (!hasContract) {
      // договора ещё не было → сразу запускаем генерацию
      setStepState({ status: 'generate', signature: signatureRef.current })
      return
    }

    if (!signed) {
      // договор есть, но не подписан → финальный экран с вводом кода
      setStepState({ status: 'await_sign' })
      return
    }

    if (shouldRegen) {
      // был подписан и данные изменились → один экран, который тихо запустит генерацию
      setStepState({ status: 'generate', signature: signatureRef.current })
      return
    }

    // был подписан и изменений нет → полностью пропускаем экран
    const tariffSnapshot = (data.contract as any)?.tariff_snapshot ?? null
    const contractRequiresPayment = tariffSnapshot
      ? (tariffSnapshot.was_signed_before_regen
          ? Boolean(tariffSnapshot.device_added) && Number(tariffSnapshot.device_added_count || 0) > 0
          : Number(tariffSnapshot.total_extra_fee || 0) > 0)
      : false
    const hasPendingInvoice = (data.invoices ?? []).some(
      (invoice) =>
        (invoice.status ?? '').toLowerCase() === 'pending' &&
        Boolean(data.contract?.contract_number) &&
        invoice.contract_number === data.contract?.contract_number &&
        contractRequiresPayment,
    )
    setStepState({ status: 'skip', needsInvoice: hasPendingInvoice })
  }, [
    clientId,
    data?.id,
    data?.contract?.contract_number,
    data?.contract?.signed_at,
    JSON.stringify((data.contract as any)?.passport_snapshot ?? null),
    JSON.stringify((data.contract as any)?.device_snapshot ?? []),
    JSON.stringify((data.contract as any)?.tariff_snapshot ?? null),
    JSON.stringify(data.passport ?? null),
    JSON.stringify((data.devices ?? []).map((d) => ({
      id: d.id,
      updated_at: d.updated_at,
      hash: JSON.stringify(d),
    }))),
    data?.tariff?.calculated_at,
    data?.tariff?.total_extra_fee,
  ])

  useEffect(() => {
    if (contractNumber) {
      setNewNumber(contractNumber)
      if (
        awaitingFreshContract &&
        (!oldContractRef.current || contractNumber !== oldContractRef.current.number)
      ) {
        setAwaitingFreshContract(false)
      }
    }
  }, [awaitingFreshContract, contractNumber])

  const requestOtpMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      const anyApi = api as any
      if (typeof anyApi.requestContractOtp === 'function') {
        return await anyApi.requestContractOtp(clientId, { channel: 'support_chat' })
      }
      throw new Error('API requestContractOtp отсутствует на бэкенде');
    },
    onSuccess: () => {
      setCooldown(60) // стартуем отсчёт только ПОСЛЕ успешной отправки кода
      queryClient.invalidateQueries({ queryKey })
    },
    onError: () => { setErrorMsg('Не удалось отправить код. Попробуйте ещё раз через минуту.') },
  })

  useEffect(() => {
    if (!data?.contract?.contract_number) return
    if (!_justGeneratedRef.current) return
    if (!newNumber || data.contract.contract_number !== newNumber) return

    // авто-отправка кода единоразово после свежей генерации
    _justGeneratedRef.current = false
    requestOtpMutation.mutate(undefined, {
      onSuccess: () => setCooldown(60),
    })
  }, [data?.contract?.contract_number])

  // (Удалено: лишний useEffect, который дублирует генерацию)

  const confirmContractMutation = useMutation<ClientDetail, unknown, string>({
  mutationFn: async (code: string) => {
    // единая «истина»: вызываем API
    return await api.confirmContract(clientId, { otp_code: code })
  },
  onSuccess: async (detail) => {
    // синхронизируем кеш
    updateCache(detail)
    oldContractRef.current = null
    await queryClient.invalidateQueries({ queryKey })

    // попытка создать счёт (если на бэке такой эндпоинт есть — опционально)
    try {
      const anyApi = api as any
      if (typeof anyApi.createInvoice === 'function') {
        await anyApi.createInvoice(clientId)
        await queryClient.invalidateQueries({ queryKey })
      }
    } catch (e) {
      console.warn('Не удалось создать счёт автоматически', e)
    }

    goNext()
  },
  onError: (err: any) => {
    // 400/401 → «Код недействителен…»
    const msg =
      (err?.response?.data?.detail) ||
      (err?.message?.toLowerCase?.().includes('invalid') ? 'Код недействительный или просрочен. Попробуйте снова.' : '') ||
      'Код недействительный или просрочен. Попробуйте снова.'
    setErrorMsg(msg)
    queryClient.invalidateQueries({ queryKey })
  },
})

  const goBack = () => navigate(`/clients/${clientId}/step/3?tab=${returnTab}`)
  const goNext = async () => {
    if (!data?.contract?.signed_at) return // защита: не пускаем дальше до подписания
    await queryClient.invalidateQueries({ queryKey: ['client', clientId] })
    navigate(`/clients/${clientId}/step/success?tab=${returnTab}`)
  }

  const handleGenerate = async () => {
    setErrorMsg(null)
    try {
      if (!hasContract) {
        await generateMutation.mutateAsync()
      }
      await requestOtpMutation.mutateAsync()
    } catch (e) {
      setErrorMsg('Не удалось отправить код. Попробуйте ещё раз через минуту.')
      console.error(e)
    }
  }

  const handleOtpChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.replace(/\D/g, '').slice(0, 6)
    setErrorMsg(null)
    setOtp(next)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  const sanitized = otp.trim()
  if (!sanitized) {
    setErrorMsg('Введите код из приложения клиента из чата "Подписать договор".')
    return
  }
  confirmContractMutation
    .mutateAsync(sanitized)
    .then(async () => {
      setOtp('')
      await queryClient.invalidateQueries({ queryKey })
      goNext()
    })
    .catch(() => {
      /* onError уже показывает сообщение */
    })
}

  if (isLoading) {
    return <p className="clients__placeholder">Загружаем договор…</p>
  }

  if (isError || !data) {
    return (
      <div className="clients__placeholder">
        <p>Не удалось загрузить данные.</p>
        <button type="button" onClick={() => refetch()}>Повторить</button>
      </div>
    )
  }
  const signed = Boolean(data?.contract?.signed_at)
  const hasContract = Boolean(contractNumber)
  const isOtpReady = otp.trim().length >= 4
  const oldContractNumber = oldContractRef.current?.number ?? null
  const oldContractUrl = oldContractRef.current?.url ?? null
  const showOldContract = Boolean(oldContractNumber)

  const renderBody = () => {
    if (stepState.status === 'loading') {
      return (
        <p className="info-title">
          Проверяем изменения… {'.'.repeat(dots)}
        </p>
      )
    }

    if (stepState.status === 'skip') {
      return (
        <>
          {hasContract && contractNumber && (
            <p className="info-title">
              <a
                href={data.contract?.contract_url ? String(data.contract.contract_url) : undefined}
                target={data.contract?.contract_url ? '_blank' : undefined}
                rel={data.contract?.contract_url ? 'noreferrer' : undefined}
                className="contract-link"
              >
                Договор №{getShortContractLabel(contractNumber, data)}
              </a>
            </p>
          )}
          <p className="text-hint">
            {Boolean(data.contract?.signed_at) ? 'Договор подписан. Можно переходить далее.' : 'Договор готов. Подтвердите его кодом из чата «Support».'}
          </p>
          {stepState.needsInvoice && (
            <p className="text-hint text-hint--warning">
              Условия вступят в силу после оплаты дополнительного счёта.
            </p>
          )}
        </>
      )
    }

    if (stepState.status === 'await_sign') {
      return (
        <>
          {showOldContract && (
            <p className="info-title">
              Старый договор:{' '}
              <a
                href={oldContractUrl ? String(oldContractUrl) : undefined}
                target={oldContractUrl ? '_blank' : undefined}
                rel={oldContractUrl ? 'noreferrer' : undefined}
                className="contract-link"
              >
                №{getShortContractLabel(oldContractNumber, data)}
              </a>
            </p>
          )}

          {hasContract && contractNumber && (
            <p className="info-title">
              Новый договор:{' '}
              <a
                href={data.contract?.contract_url ? String(data.contract.contract_url) : undefined}
                target={data.contract?.contract_url ? '_blank' : undefined}
                rel={data.contract?.contract_url ? 'noreferrer' : undefined}
                className="contract-link"
              >
                №{getShortContractLabel(contractNumber, data)}
              </a>
            </p>
          )}

          <form className="device-form" onSubmit={handleSubmit}>
            <label className="device-form__field">
              <span>Код подтверждения</span>
              <input
                type="text"
                value={otp}
                onChange={handleOtpChange}
                maxLength={6}
                placeholder="Введите код"
              />
            </label>

            {cooldown > 0 ? (
              <p className="text-hint text-hint--disabled">
                Код отправлен: проверьте чат «Support». Новый код можно запросить через {cooldown} секунд.
              </p>
            ) : (
              <button
                type="button"
                className="step-modal__link"
                onClick={handleGenerate}
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? 'Отправляем…' : 'Получить код'}
              </button>
            )}

            <button
              type="submit"
              className="btn btn-blue"
              disabled={confirmContractMutation.isPending || !isOtpReady}
            >
              Подтвердить
            </button>
          </form>

          <p className="text-hint">
            Введите код из приложения клиента из чата "Подписать договор".
          </p>
        </>
      )
    }

    const isGenerating =
      stepState.status === 'generate' || generateMutation.isPending || awaitingFreshContract

    return (
      <>
        {showOldContract && (
          <p className="info-title">
            Старый договор:{' '}
            <a
              href={oldContractUrl ? String(oldContractUrl) : undefined}
              target={oldContractUrl ? '_blank' : undefined}
              rel={oldContractUrl ? 'noreferrer' : undefined}
              className="contract-link"
            >
              №{getShortContractLabel(oldContractNumber, data)}
            </a>
          </p>
        )}

        <p className="info-title">
          Новый договор:{' '}
          {!isGenerating && contractNumber ? (
            <a
              href={data.contract?.contract_url ? String(data.contract.contract_url) : undefined}
              target={data.contract?.contract_url ? '_blank' : undefined}
              rel={data.contract?.contract_url ? 'noreferrer' : undefined}
              className="contract-link"
            >
              №{getShortContractLabel(contractNumber, data)}
            </a>
          ) : null}
        </p>

        {isGenerating ? (
          <>
            <p className="contract-loader">
              <span className="contract-loader__label">Генерация</span>
              <span className="contract-loader__dots">{dots ? '.'.repeat(dots) : ''}</span>
            </p>
            <p className="text-hint">Готовим обновлённый договор…</p>
          </>
        ) : (
          <form className="device-form" onSubmit={handleSubmit}>
            {showOldContract && (
              <p className="info-title">
                Старый договор:{' '}
                <a
                  href={oldContractUrl ? String(oldContractUrl) : undefined}
                  target={oldContractUrl ? '_blank' : undefined}
                  rel={oldContractUrl ? 'noreferrer' : undefined}
                  className="contract-link"
                >
                  №{getShortContractLabel(oldContractNumber, data)}
                </a>
              </p>
            )}

            <p className="info-title">
              Новый договор:{' '}
              {contractNumber ? (
                <a
                  href={data.contract?.contract_url ? String(data.contract.contract_url) : undefined}
                  target={data.contract?.contract_url ? '_blank' : undefined}
                  rel={data.contract?.contract_url ? 'noreferrer' : undefined}
                  className="contract-link"
                >
                  №{getShortContractLabel(contractNumber, data)}
                </a>
              ) : null}
            </p>

            <label className="device-form__field">
              <span>Код подтверждения</span>
              <input
                type="text"
                value={otp}
                onChange={handleOtpChange}
                maxLength={6}
                placeholder="Введите код"
              />
            </label>

            {cooldown > 0 ? (
              <p className="text-hint text-hint--disabled">
                Код отправлен: проверьте чат «Support». Новый код можно запросить через {cooldown} секунд.
              </p>
            ) : (
              <button
                type="button"
                className="step-modal__link"
                onClick={handleGenerate}
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? 'Отправляем…' : 'Получить код'}
              </button>
            )}

            <button
              type="submit"
              className="btn btn-blue"
              disabled={confirmContractMutation.isPending || !isOtpReady}
            >
              Подтвердить
            </button>
          </form>
        )}
      </>
    )
  }

  return (
    <div className="page-blue step-wrapper">
      <div className="step-modal">
        <div className="step-modal__header">
          <h2 className="step-modal__title step-modal__title--center">Шаг 4 — Договор</h2>
        </div>

        <section className="step-modal__body">
          {errorMsg && (
            <p className="clients__placeholder text-error">{errorMsg}</p>
          )}

          {renderBody()}
        </section>

        <footer className="step-modal__footer">
          <button type="button" className="btn btn-blue" onClick={goBack}>
            Назад
          </button>
          <button
            type="button"
            className="btn btn-blue"
            onClick={goNext}
            disabled={!Boolean(data?.contract?.signed_at)}
            aria-disabled={!Boolean(data?.contract?.signed_at)}
          >
            Далее
          </button>
        </footer>
      </div>
    </div>
  )
}

export default ClientStep4Contract
