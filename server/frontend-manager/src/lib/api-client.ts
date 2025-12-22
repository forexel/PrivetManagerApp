import { clearAccessToken } from './auth'
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/manager'

export type LoginResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

export type ManagerProfile = {
  id: string
  email: string
  name: string | null
  is_super_admin: boolean
  created_at: string
  updated_at: string
}

export type LoginPayload = {
  email: string
  password: string
}

async function parseError(response: Response) {
  try {
    const data = await response.json()
    return data?.detail ?? 'Произошла ошибка'
  } catch (error) {
    return 'Произошла ошибка'
  }
}

export async function loginManager(payload: LoginPayload): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as LoginResponse
}

type FetchOptions = RequestInit & { token: string }

async function authorizedFetch<T>(path: string, { token, ...init }: FetchOptions): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 401) {
    clearAccessToken()
    if (typeof window !== 'undefined') {
      window.location.replace('/')
    }
    throw new Error('Требуется повторная авторизация')
  }

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function createApiClient(token: string) {
  return {
    getClients(tab: string) {
      return authorizedFetch<ClientSummary[]>(`/clients?tab=${encodeURIComponent(tab)}`, {
        token,
        method: 'GET',
      })
    },
    getManagerProfile() {
      return authorizedFetch<ManagerProfile>(`/auth/me`, {
        token,
        method: 'GET',
      })
    },
    getClient(clientId: string) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}`, {
        token,
        method: 'GET',
      })
    },
    updateProfile(clientId: string, payload: ClientProfileUpdate) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/profile`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    },
    upsertPassport(clientId: string, payload: PassportUpsert) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/passport`, {
        token,
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    },
    createPassportPhotoUpload(clientId: string, contentType?: string | null) {
      return authorizedFetch<PresignedUploadResponse>(`/clients/${clientId}/passport/photo/upload-url`, {
        token,
        method: 'POST',
        body: JSON.stringify({ content_type: contentType ?? undefined }),
      })
    },
    attachPassportPhoto(clientId: string, fileKey: string) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/passport/photo`, {
        token,
        method: 'POST',
        body: JSON.stringify({ file_key: fileKey }),
      })
    },
    deletePassportPhoto(clientId: string) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/passport/photo`, {
        token,
        method: 'DELETE',
      })
    },
    createDevice(clientId: string, payload: DeviceCreate) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/devices`, {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    updateDevice(clientId: string, deviceId: string, payload: DeviceUpdate) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/devices/${deviceId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    },
    deleteDevice(clientId: string, deviceId: string) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/devices/${deviceId}`, {
        token,
        method: 'DELETE',
      })
    },
    addDevicePhoto(clientId: string, deviceId: string, fileKey: string) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/devices/${deviceId}/photos`, {
        token,
        method: 'POST',
        body: JSON.stringify({ file_key: fileKey }),
      })
    },
    deleteDevicePhoto(clientId: string, deviceId: string, photoId: string) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/devices/${deviceId}/photos/${photoId}`, {
        token,
        method: 'DELETE',
      })
    },
    createDevicePhotoUpload(clientId: string, deviceId: string, contentType?: string) {
      return authorizedFetch<PresignedUploadResponse>(
        `/clients/${clientId}/devices/${deviceId}/photos/upload-url`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({ content_type: contentType }),
        },
      )
    },
    calculateTariff(clientId: string, payload: TariffCalculateRequest) {
      return authorizedFetch<TariffCalculateResponse>(`/clients/${clientId}/tariff/calculate`, {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    applyTariff(clientId: string, payload: TariffCalculateRequest) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/tariff/apply`, {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    generateContract(clientId: string) {
      return authorizedFetch<ContractGenerateResponse>(`/clients/${clientId}/contract/generate`, {
        token,
        method: 'POST',
      })
    },
    requestContractOtp(clientId: string, body?: { channel?: 'support_chat' }) {
      return authorizedFetch<{ ok: true }>(`/clients/${clientId}/contract/request-otp`, {
        token,
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      })
    },
    confirmContract(clientId: string, payload: ContractConfirmRequest) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/contract/confirm`, {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    confirmPayment(clientId: string, payload: PaymentConfirmRequest) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/payment/confirm`, {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    notifyBilling(clientId: string, payload: BillingNotifyRequest) {
      return authorizedFetch<ClientDetail>(`/clients/${clientId}/billing/notify`, {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
  }
}

export type ClientSummary = {
  id: string
  user_id: string
  full_name: string | null
  phone: string
  email: string | null
  status: string
  assigned_manager_id: string | null
  created_at: string
  updated_at: string
  devices_count: number
  registration_address?: string | null
}

export type ClientDetail = {
  id: string
  status: string
  assigned_manager_id: string | null
  user: {
    id: string
    phone: string
    email: string | null
    name: string | null
    address?: string | null
  }
  passport: {
    id: string
    created_at: string
    last_name: string
    first_name: string
    middle_name: string | null
    series: string
    number: string
    issued_by: string
    issue_code: string
    issue_date: string
    registration_address: string
    updated_at: string
    photo_url: string | null
  } | null
  devices: Array<{
    id: string
    device_type: string
    title: string
    description: string | null
    specs: Record<string, unknown> | null
    extra_fee: number
    created_at: string
    updated_at: string
    photos: Array<{ id: string; file_key: string; created_at: string; file_url: string }>
  }>
  tariff: {
    tariff_id: string | null
    name: string | null
    base_fee: number | null
    extra_per_device: number | null
    device_count: number
    total_extra_fee: number
    calculated_at: string
  } | null
  contract: {
    otp_code: string | null
    otp_sent_at: string | null
    signed_at: string | null
    payment_confirmed_at: string | null
    contract_url: string | null
    contract_number: string | null
  } | null
  invoices: Array<{
    id: string
    amount: number
    description: string
    contract_number: string
    due_date: string
    status: string
    created_at: string
  }>
}

export type ClientProfileUpdate = {
  phone: string
  email: string | null
  name: string | null
  address: string | null
}

export type PassportUpsert = {
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  series?: string | null
  number?: string | null
  issued_by?: string | null
  issue_code?: string | null
  issue_date?: string | null
  registration_address?: string | null
  photo_url?: string | null
}

export type DeviceCreate = {
  device_type: string
  title: string
  description: string | null
  specs: Record<string, unknown> | null
  extra_fee: number
}

export type DeviceUpdate = Partial<DeviceCreate>

export type TariffCalculateRequest = {
  device_count: number
  tariff_id?: string | null
}

export type TariffCalculateResponse = {
  device_count: number
  extra_per_device: number
  total_extra_fee: number
}

export type ContractGenerateResponse = {
  contract_id: string
  otp_code: string
  contract_url: string | null
  contract_number: string | null
}

export type ContractConfirmRequest = {
  otp_code: string
}

export type PaymentConfirmRequest = {
  amount?: number | null
}

export type PresignedUploadResponse = {
  url: string
  fields: Record<string, string>
  file_key: string
}

export type BillingNotifyRequest = {
  amount: number
  description: string
  contract_number: string
  due_date: string
}
