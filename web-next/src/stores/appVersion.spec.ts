// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchDeployedVersion, isOutdated, useAppVersionStore } from './appVersion'

describe('isOutdated', () => {
  it('reports a deploy when the served version differs', () => {
    expect(isOutdated('abc123', 'def456')).toBe(true)
  })

  it('stays quiet when the versions match', () => {
    expect(isOutdated('abc123', 'abc123')).toBe(false)
  })

  it.each([
    ['a missing version', undefined],
    ['a null version', null],
    ['a non-string version', 42],
    ['an empty string', ''],
  ])('does not prompt on %s', (_label, latest) => {
    expect(isOutdated('abc123', latest)).toBe(false)
  })

  it('does not prompt when the running version is unknown', () => {
    // A dev build has no injected version; never nag in that case.
    expect(isOutdated('', 'def456')).toBe(false)
  })
})

const respondWith = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  } as Response)

describe('fetchDeployedVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the deployed version', async () => {
    respondWith({ version: 'def456' })

    await expect(fetchDeployedVersion()).resolves.toBe('def456')
  })

  // A stale read defeats the whole point of polling.
  it('asks for an uncached copy', async () => {
    const fetchMock = respondWith({ version: 'def456' })

    await fetchDeployedVersion()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/version\.json\?t=\d+$/), {
      cache: 'no-store',
    })
  })

  it.each([
    ['a malformed body', { version: 42 }],
    ['a body with no version', {}],
    ['a null body', null],
  ])('gives up on %s', async (_label, body) => {
    respondWith(body)

    await expect(fetchDeployedVersion()).resolves.toBeUndefined()
  })

  it('gives up on an error response', async () => {
    respondWith({ version: 'def456' }, false)

    await expect(fetchDeployedVersion()).resolves.toBeUndefined()
  })

  it('gives up when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    await expect(fetchDeployedVersion()).resolves.toBeUndefined()
  })
})

describe('useAppVersionStore', () => {
  const store = () => useAppVersionStore.getState()

  beforeEach(() => {
    useAppVersionStore.setState({
      runningVersion: 'abc123',
      updateAvailable: false,
      dismissedVersion: '',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers the update once a new version is deployed', async () => {
    respondWith({ version: 'def456' })

    await store().check()

    expect(store().updateAvailable).toBe(true)
  })

  it('stays quiet while the deployed version is the running one', async () => {
    respondWith({ version: 'abc123' })

    await store().check()

    expect(store().updateAvailable).toBe(false)
  })

  it('stops offering a version the user dismissed', async () => {
    respondWith({ version: 'def456' })

    await store().dismiss()
    await store().check()

    expect(store().dismissedVersion).toBe('def456')
    expect(store().updateAvailable).toBe(false)
  })

  // Otherwise dismissing once would silence every later deploy too.
  it('offers again when a further version lands after a dismissal', async () => {
    respondWith({ version: 'def456' })
    await store().dismiss()

    respondWith({ version: 'ghi789' })
    await store().check()

    expect(store().updateAvailable).toBe(true)
  })
})
