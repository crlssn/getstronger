// @vitest-environment jsdom

import type { PersistStorage, StorageValue } from 'zustand/middleware'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { isSignedIn } from '@/router/guards'
import { useAuthStore } from '@/stores/auth'
import { migratedStorage } from '@/stores/persistence'
import { persistedStores, rehydrated } from './persisted'

/** A storage whose read only answers when the test lets it. */
const held = () => {
  let release: (value: StorageValue<unknown>) => void = () => {}
  const storage: PersistStorage<unknown> = {
    getItem: () => new Promise((resolve) => (release = resolve)),
    setItem: () => undefined,
    removeItem: () => undefined,
  }
  return { storage, release: (value: StorageValue<unknown>) => release(value) }
}

describe('persistedStores', () => {
  // A store left off this list is read before it has loaded on native, which
  // is exactly the bug the list exists to prevent.
  test('lists every store that persists', () => {
    const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./*.spec.ts'], {
      eager: true,
    })
    const persisting = Object.values(modules)
      .flatMap((module) => Object.values(module))
      .filter((value) => typeof value === 'function' && 'persist' in value)

    expect(persisting).toHaveLength(persistedStores.length)
    persisting.forEach((store) => expect(persistedStores).toContain(store))
  })
})

describe('rehydrated', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ userId: '', accessToken: '' })
  })

  afterEach(() => {
    useAuthStore.persist.setOptions({ storage: migratedStorage() })
    useAuthStore.setState({ userId: '', accessToken: '' })
  })

  test('resolves at once when every store has already read', async () => {
    await expect(rehydrated()).resolves.toBeUndefined()
  })

  // What the boot path relies on: a guard that runs before this resolves
  // reads an empty session and sends a signed-in user to login.
  test('holds the access guard until the session has arrived', async () => {
    const { storage, release } = held()
    useAuthStore.persist.setOptions({ storage })
    void useAuthStore.persist.rehydrate()
    expect(isSignedIn()).toBe(false)

    let settled = false
    const waiting = rehydrated([useAuthStore]).then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)

    release({ state: { userId: 'user-1', accessToken: 'token' }, version: 0 })
    await waiting

    expect(isSignedIn()).toBe(true)
  })

  test('waits for the slowest of several', async () => {
    const { storage, release } = held()
    useAuthStore.persist.setOptions({ storage })
    void useAuthStore.persist.rehydrate()

    let settled = false
    const waiting = rehydrated(persistedStores).then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)

    release({ state: { userId: 'user-1', accessToken: 'token' }, version: 0 })
    await waiting

    expect(settled).toBe(true)
  })
})
