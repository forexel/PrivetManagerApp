
import { useMemo } from 'react'
import { useAuth } from './auth-context'
import { createApiClient } from './api-client'

function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useApi() {
  const { token } = useAuth()
  return useMemo(() => {
    const api = createApiClient(token) as any

    // --- Generic presigned helper ---
    // --- Generic presigned helper ---
    async function requestPresigned(contentType: string = 'image/jpeg') {
      // пробуем POST
      let res = await fetch('/api/manager/uploads/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ content_type: contentType }),
      })

      // если на бэке разрешён только GET — один раз ретраим
      if (res.status === 405) {
        try { console.warn('[presigned] POST 405 — retry GET') } catch {}
        res = await fetch(`/api/manager/uploads/presigned?content_type=${encodeURIComponent(contentType)}`, {
          method: 'GET',
          headers: { ...authHeaders(token) },
        })
      }

      if (!res.ok) throw new Error('presigned request failed')

      const raw = await res.json() as any
      try { console.debug('[presigned url]', raw?.url, raw) } catch {}

      const file_key =
        raw?.file_key ??
        raw?.fields?.key ??
        raw?.fields?.Key ??
        raw?.key ??
        raw?.object_key ??
        raw?.path

      try { console.debug('[presigned]', { file_key, fields: raw?.fields }) } catch {}
      if (!file_key || typeof file_key !== 'string') {
        throw new Error('presigned: missing file_key')
      }
      return { ...raw, file_key } as { url: string; fields: Record<string, string>; file_key: string }
    }

    async function uploadToPresigned(
      presigned: { url: string; fields: Record<string, string> },
      file: Blob,
      fileName = 'photo.jpg',
      contentType = 'image/jpeg',
    ) {
      const fd = new FormData()
      let hasContentTypeField = false
      Object.entries(presigned.fields).forEach(([k, v]) => {
        fd.append(k, v as string)
        if (k.toLowerCase() === 'content-type') {
          hasContentTypeField = true
        }
      })
      if (!hasContentTypeField && contentType) {
        fd.append('Content-Type', contentType)
      }
      fd.append('file', file, fileName)

      // Local dev fallback: если вернулся host.docker.internal — подменяем на текущий хост
      let uploadUrl = presigned.url
      try {
        const u = new URL(uploadUrl)
        if (u.hostname === 'host.docker.internal') {
          const currentHost = (typeof window !== 'undefined' ? window.location.hostname : 'localhost') || 'localhost'
          u.hostname = currentHost
          // если в исходном URL есть порт — сохраняем его, иначе оставляем как есть
          uploadUrl = u.toString()
        }
      } catch {}

      const up = await fetch(uploadUrl, { method: 'POST', body: fd })
      if (!up.ok) {
        let text = ''
        try { text = await up.text() } catch {}
        try { console.error('[presigned upload error]', up.status, text) } catch {}
        throw new Error('upload to presigned failed')
      }
      try { console.debug('[presigned upload OK]', uploadUrl) } catch {}
    }

    // --- Direct upload fallback for local dev ---
    async function directUpload(blob: Blob, fileName = 'file.bin', contentType = 'application/octet-stream') {
      const fd = new FormData()
      fd.append('file', new File([blob], fileName, { type: contentType }))
      const res = await fetch('/api/manager/uploads/direct', {
        method: 'POST',
        headers: { ...authHeaders(token) },
        body: fd,
      })
      if (!res.ok) throw new Error('direct upload failed')
      const j = await res.json() as any
      if (!j?.file_key) throw new Error('direct upload: missing file_key')
      return j as { file_key: string; url?: string }
    }

    async function ensureUploadedGetFileKey(blob: Blob, fileName: string, mimeType: string) {
      try {
        const presigned = await requestPresigned(mimeType)
        try {
          await uploadToPresigned(presigned, blob, fileName, mimeType)
          return presigned.file_key as string
        } catch (e) {
          // fall back to backend
          const d = await directUpload(blob, fileName, mimeType)
          return d.file_key
        }
      } catch (e) {
        const d = await directUpload(blob, fileName, mimeType)
        return d.file_key
      }
    }

    // --- Devices photos ---
    async function addDevicePhoto(clientId: string, deviceId: string, blob: Blob, fileName = 'device.jpg', mimeType = 'image/jpeg') {
      const file_key = await ensureUploadedGetFileKey(blob, fileName, mimeType)
      try { console.debug('[device photo] saving', { clientId, deviceId, file_key }) } catch {}
      const res = await fetch(`/api/manager/clients/${clientId}/devices/${deviceId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ file_key, photo_file_key: file_key }),
      })
      if (!res.ok) throw new Error('save device photo failed')
      return await res.json()
    }

    async function deleteDevicePhoto(clientId: string, deviceId: string, photoId: string) {
      const res = await fetch(`/api/manager/clients/${clientId}/devices/${deviceId}/photos/${photoId}`, {
        method: 'DELETE',
        headers: { ...authHeaders(token) },
      })
      if (!res.ok) throw new Error('delete device photo failed')
    }

    // --- Devices: delete with POST fallback ---
    async function deleteDevice(clientId: string, deviceId: string) {
      // Some proxies block DELETE; try POST /delete first
      let res = await fetch(`/api/manager/clients/${clientId}/devices/${deviceId}/delete`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      });

      // If backend supports RESTful DELETE (405/404 on POST) — retry with DELETE
      if (res.status === 405 || res.status === 404) {
        res = await fetch(`/api/manager/clients/${clientId}/devices/${deviceId}`, {
          method: 'DELETE',
          headers: { ...authHeaders(token) },
        });
      }

      // Both variants return 204 No Content on success
      if (!res.ok && res.status !== 204) {
        let detail = '';
        try { detail = (await res.json())?.detail || '' } catch {}
        throw new Error(detail || 'deleteDevice failed');
      }
    }

    // --- Passport photo ---
    async function updatePassportPhoto(clientId: string, blob: Blob, fileName = 'passport.jpg', mimeType = 'image/jpeg') {
      const file_key = await ensureUploadedGetFileKey(blob, fileName, mimeType)
      try { console.debug('[passport photo] saving', { clientId, file_key }) } catch {}
      let res = await fetch(`/api/manager/clients/${clientId}/passport/photo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ file_key, photo_file_key: file_key }),
      })
      if (res.status === 405) {
        // совместимость со старым бэком
        res = await fetch(`/api/manager/clients/${clientId}/passport/photo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ file_key, photo_file_key: file_key }),
        })
      }
      if (!res.ok) throw new Error('passport photo update failed')
      return await res.json()
    }

    // --- Devices: create ---
    async function createDevice(clientId: string, payload: any) {
      const res = await fetch(`/api/manager/clients/${clientId}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.json())?.detail || '';
        } catch {}
        throw new Error(detail || 'createDevice failed');
      }
      return await res.json();
    }

    async function updateDevice(clientId: string, deviceId: string, payload: any){
      const res = await fetch(`/api/manager/clients/${clientId}/devices/${deviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.detail || '' } catch {}
        throw new Error(detail || 'updateDevice failed')
      }
      return await res.json()
    }

    // --- Client profile (Step 1) ---
    async function updateProfile(clientId: string, payload: any) {
      console.log('[API] PATCH /clients/profile payload', payload);

      const res = await fetch(`/api/manager/clients/${clientId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.detail || '' } catch {}
        throw new Error(detail || 'updateProfile failed')
      }
      return await res.json()
    }

    // --- Passport upsert (PATCH preferred; fallback to PUT/POST) ---
    async function upsertPassport(clientId: string, payload: any) {
      let res = await fetch(`/api/manager/clients/${clientId}/passport`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      })
      if (res.status === 405) {
        res = await fetch(`/api/manager/clients/${clientId}/passport`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify(payload),
        })
      }
      if (res.status === 405) {
        res = await fetch(`/api/manager/clients/${clientId}/passport`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.detail || '' } catch {}
        throw new Error(detail || 'upsertPassport failed')
      }
      return await res.json()
    }

    async function generateContract(clientId: string) {
      const res = await fetch(`/api/manager/clients/${clientId}/contract/generate`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      if (!res.ok) throw new Error('generateContract failed')
      return await res.json()
    }

    // --- Contract OTP / Confirm ---
    async function requestContractOtp(clientId: string, _payload: any = { channel: 'support_chat' }) {
      let res = await fetch(`/api/manager/clients/${clientId}/contract/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(_payload),
      })
      if (res.status === 405 || res.status === 404) {
        res = await fetch(`/api/manager/clients/${clientId}/contract/otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify(_payload),
        })
      }
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.detail || '' } catch {}
        throw new Error(detail || 'requestContractOtp failed')
      }
      return await res.json()
    }

    async function confirmContract(clientId: string, payload: { otp_code: string }) {
      const res = await fetch(`/api/manager/clients/${clientId}/contract/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.detail || '' } catch {}
        const err: any = new Error(detail || 'confirmContract failed')
        ;(err as any).response = { data: { detail } } // чтобы onError мог красиво показать
        throw err
      }
      return await res.json()
    }

    // --- Invoice ensure (optional) ---
    async function createInvoice(clientId: string) {
      let res = await fetch(`/api/manager/clients/${clientId}/invoice/ensure`, {
        method: 'POST',
        headers: { ...authHeaders(token) },
      })
      if (res.status === 405 || res.status === 404) {
        res = await fetch(`/api/manager/clients/${clientId}/invoices/ensure`, {
          method: 'POST',
          headers: { ...authHeaders(token) },
        })
      }
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.detail || '' } catch {}
        throw new Error(detail || 'createInvoice failed')
      }
      return await res.json().catch(() => ({}))
    }

    Object.assign(api, { requestContractOtp, confirmContract, createInvoice })

    return {
      ...api,
      requestPresigned,
      uploadToPresigned,
      addDevicePhoto,
      deleteDevicePhoto,
      deleteDevice,
      updatePassportPhoto,
      generateContract,
      requestContractOtp,
      updateDevice,
      updateProfile,
      upsertPassport,
    }
  }, [token])
}