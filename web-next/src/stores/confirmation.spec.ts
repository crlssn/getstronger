import { beforeEach, describe, expect, test } from 'vitest'

import { useConfirmationStore } from './confirmation'

const store = () => useConfirmationStore.getState()

const request = { title: 'Delete this exercise?', confirmLabel: 'Delete' }

describe('useConfirmationStore', () => {
  beforeEach(() => {
    useConfirmationStore.setState({ confirmation: null, resolver: null })
  })

  test('resolves true when the dialog is accepted', async () => {
    const answer = store().confirm(request)
    store().accept()

    await expect(answer).resolves.toBe(true)
  })

  test('resolves false when the dialog is dismissed', async () => {
    const answer = store().confirm(request)
    store().dismiss()

    await expect(answer).resolves.toBe(false)
  })

  test('exposes the request while it is open and clears it once settled', () => {
    void store().confirm(request)
    expect(store().confirmation).toEqual(request)

    store().accept()
    expect(store().confirmation).toBeNull()
  })

  // Without this, the caller of a superseded confirm would await forever.
  test('resolves a pending request as declined when another one supersedes it', async () => {
    const first = store().confirm(request)
    const second = store().confirm({ title: 'Discard this workout?', confirmLabel: 'Discard' })
    store().accept()

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(true)
  })

  test('ignores a second settle for the same request', async () => {
    const answer = store().confirm(request)
    store().accept()
    store().dismiss()

    await expect(answer).resolves.toBe(true)
  })
})
