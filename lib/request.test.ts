import assert from 'node:assert/strict'
import test from 'node:test'

import { apiClient, parseApiResponse } from './request'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    statusText: status >= 400 ? 'Request failed' : 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

test('returns a standard success envelope without nesting it again', async () => {
  const result = await parseApiResponse<{ token: string }>(
    jsonResponse({
      success: true,
      data: { token: 'token-123' },
    })
  )

  assert.deepEqual(result, {
    success: true,
    data: { token: 'token-123' },
  })
  assert.equal(result.success && result.data.token, 'token-123')
})

test('apiClient exposes login tokens at response.data.token', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async () =>
    jsonResponse({
      success: true,
      data: { token: 'login-token' },
    })

  const result = await apiClient.post<{ token: string }>(
    'https://example.test/api/login',
    { email: 'user@example.test' }
  )

  assert.equal(result.success && result.data.token, 'login-token')
})

test('apiClient preserves every supported HeaderInit representation', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const observed: Array<{ authorization: string | null; csrf: string | null }> = []
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers)
    observed.push({
      authorization: headers.get('authorization'),
      csrf: headers.get('x-csrf-token'),
    })
    return jsonResponse({ success: true, data: { ok: true } })
  }

  const headerForms: HeadersInit[] = [
    {
      Authorization: 'Bearer object-token',
      'X-CSRF-Token': 'object-csrf',
    },
    new Headers({
      Authorization: 'Bearer headers-token',
      'X-CSRF-Token': 'headers-csrf',
    }),
    [
      ['Authorization', 'Bearer tuple-token'],
      ['X-CSRF-Token', 'tuple-csrf'],
    ],
  ]

  for (const headers of headerForms) {
    await apiClient.get('https://example.test/api/me', { headers })
  }

  assert.deepEqual(observed, [
    { authorization: 'Bearer object-token', csrf: 'object-csrf' },
    { authorization: 'Bearer headers-token', csrf: 'headers-csrf' },
    { authorization: 'Bearer tuple-token', csrf: 'tuple-csrf' },
  ])
})

test('preserves a business failure returned with HTTP 200', async () => {
  const result = await parseApiResponse<{ token: string }>(
    jsonResponse({
      success: false,
      error: 'Invalid password',
    })
  )

  assert.deepEqual(result, {
    success: false,
    error: 'Invalid password',
  })
})

test('keeps compatibility with a bare success payload', async () => {
  const result = await parseApiResponse<{ id: string }>(
    jsonResponse({ id: 'reservation-1' })
  )

  assert.deepEqual(result, {
    success: true,
    data: { id: 'reservation-1' },
  })
})

test('normalizes a non-envelope HTTP error', async () => {
  const result = await parseApiResponse(
    jsonResponse({ error: 'Time slot unavailable' }, 409)
  )

  assert.deepEqual(result, {
    success: false,
    error: 'Time slot unavailable',
  })
})

test('normalizes structured envelope errors to a message', async () => {
  const result = await parseApiResponse(
    jsonResponse({
      success: false,
      error: {
        type: 'unauthorized',
        message: 'Authentication required',
      },
    })
  )

  assert.deepEqual(result, {
    success: false,
    error: 'Authentication required',
  })
})

test('supports successful responses without a body', async () => {
  const result = await parseApiResponse<void>(
    new Response(null, { status: 204 })
  )

  assert.deepEqual(result, {
    success: true,
    data: undefined,
  })
})
