// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: vi.fn() },
}))

import { CapacitorHttp } from '@capacitor/core'
import { nativeFetch } from './native'

const request = vi.mocked(CapacitorHttp.request)

const jsonHeaders = { 'content-type': 'application/json' }

describe('nativeFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    request.mockReset()
  })

  test('routes unary requests through the native http layer', async () => {
    request.mockResolvedValue({
      data: { accessToken: 'token' },
      headers: jsonHeaders,
      status: 200,
      url: '',
    })

    const body = new TextEncoder().encode(JSON.stringify({ email: 'a@b.c' }))
    const res = await nativeFetch('https://api.example.com/api.v1.AuthService/Login', {
      body,
      headers: jsonHeaders,
      method: 'POST',
    })

    expect(request).toHaveBeenCalledWith({
      data: { email: 'a@b.c' },
      headers: jsonHeaders,
      method: 'POST',
      url: 'https://api.example.com/api.v1.AuthService/Login',
    })
    expect(res.status).toBe(200)
    // CapacitorHttp parses JSON bodies; connect must receive the raw text back.
    await expect(res.text()).resolves.toBe(JSON.stringify({ accessToken: 'token' }))
  })

  test('keeps streaming requests on the webview fetch', async () => {
    const streamed = new Response('stream')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamed)

    const res = await nativeFetch('https://api.example.com/api.v1.NotificationService/Unread', {
      headers: { 'content-type': 'application/connect+json' },
      method: 'POST',
    })

    expect(res).toBe(streamed)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(request).not.toHaveBeenCalled()
  })

  test('passes error statuses and string bodies through untouched', async () => {
    request.mockResolvedValue({
      data: JSON.stringify({ code: 'unauthenticated', message: 'expired' }),
      headers: jsonHeaders,
      status: 401,
      url: '',
    })

    const res = await nativeFetch('https://api.example.com/api.v1.UserService/GetUser', {
      body: new TextEncoder().encode('{}'),
      headers: jsonHeaders,
      method: 'POST',
    })

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ code: 'unauthenticated', message: 'expired' })
  })

  test('rejects when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      nativeFetch('https://api.example.com/api.v1.UserService/GetUser', {
        headers: jsonHeaders,
        method: 'POST',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).not.toHaveBeenCalled()
  })
})
