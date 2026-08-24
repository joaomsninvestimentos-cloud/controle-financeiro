import type { ApiResponse } from './api-response'

export type { ApiFailure, ApiResponse, ApiSuccess } from './api-response'

type ApiEnvelope = {
  success: boolean
  data?: unknown
  error?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    ('data' in value || 'error' in value)
  )
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback

  if (typeof payload.error === 'string' && payload.error) {
    return payload.error
  }
  if (
    isRecord(payload.error) &&
    typeof payload.error.message === 'string' &&
    payload.error.message
  ) {
    return payload.error.message
  }
  if (typeof payload.message === 'string' && payload.message) {
    return payload.message
  }
  return fallback
}

export async function parseApiResponse<T>(
  response: Response
): Promise<ApiResponse<T>> {
  const fallback = response.ok
    ? 'Request failed'
    : response.statusText || `Request failed with status ${response.status}`

  if (response.status === 204) {
    return { success: true, data: undefined as T }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      success: false,
      error: response.ok ? 'Invalid JSON response' : fallback,
    }
  }

  // New API routes return the standard envelope. Preserve its semantics instead
  // of wrapping it again as { success: true, data: envelope }.
  if (isApiEnvelope(payload)) {
    if (!response.ok || !payload.success) {
      return {
        success: false,
        error: errorMessage(payload, fallback),
      }
    }
    return {
      success: true,
      data: payload.data as T,
    }
  }

  if (!response.ok) {
    return {
      success: false,
      error: errorMessage(payload, fallback),
    }
  }

  // Compatibility for existing routes that still return a bare success value.
  return {
    success: true,
    data: payload as T,
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  // Incident guard (2026-07): this module is imported by Client Components.
  // Do not import database or server-only env modules here. A previous `./env`
  // import eagerly validated DATABASE_URL in the browser and crashed rendering.
  const baseUrl = typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:13000'
    : window.location.origin

  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`

  try {
    const headers = new Headers(options.headers)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    })

    return await parseApiResponse<T>(response)
  } catch (error) {
    console.error(`Fetch error for ${fullUrl}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const apiClient = {
  get: <T>(url: string, options?: RequestInit) =>
    request<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body: unknown, options?: RequestInit) =>
    request<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown, options?: RequestInit) =>
    request<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(url: string, options?: RequestInit) =>
    request<T>(url, { ...options, method: 'DELETE' }),
}
