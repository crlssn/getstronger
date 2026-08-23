// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', () => ({ getDashboard: vi.fn() }))

import { getDashboard } from '@/http/requests'
import { selectActivePlan, selectNextRoutine, useDashboardStore } from './dashboard'

const getDashboardMock = vi.mocked(getDashboard)

const store = () => useDashboardStore.getState()

const response = (dashboard: Record<string, unknown>) => dashboard as never

describe('dashboard store', () => {
  beforeEach(() => {
    localStorage.clear()
    useDashboardStore.setState({
      preferredRoutineId: '',
      dashboard: undefined,
      loading: false,
      failed: false,
    })
    getDashboardMock.mockReset()
    getDashboardMock.mockResolvedValue(response({}))
  })

  test('exposes what the home screen shows next', async () => {
    getDashboardMock.mockResolvedValue(
      response({ nextRoutine: { id: 'r1', name: 'Push' }, activePlan: { id: 'p1' } }),
    )

    await store().load()

    expect(selectNextRoutine(store())?.name).toBe('Push')
    expect(selectActivePlan(store())?.id).toBe('p1')
  })

  // Without a plan driving the order, the routine the server offered becomes
  // the one asked for next time, so the home screen stays put across reloads.
  test('remembers the offered routine when no plan is active', async () => {
    getDashboardMock.mockResolvedValue(response({ nextRoutine: { id: 'r1' } }))

    await store().load()

    expect(store().preferredRoutineId).toBe('r1')
  })

  // An active plan decides the order itself, so remembering a routine would
  // fight it.
  test('does not remember a routine while a plan is active', async () => {
    getDashboardMock.mockResolvedValue(
      response({ nextRoutine: { id: 'r1' }, activePlan: { id: 'p1' } }),
    )

    await store().load()

    expect(store().preferredRoutineId).toBe('')
  })

  test('asks for the routine the user last chose', async () => {
    await store().selectRoutine('r2')

    expect(getDashboardMock).toHaveBeenLastCalledWith('r2')
    expect(store().preferredRoutineId).toBe('r2')
  })

  test('keeps the last dashboard when a load fails', async () => {
    getDashboardMock.mockResolvedValue(response({ nextRoutine: { id: 'r1' } }))
    await store().load()

    getDashboardMock.mockResolvedValue(undefined)
    await store().load()

    expect(selectNextRoutine(store())?.id).toBe('r1')
  })

  // Without this the home screen cannot tell an account with no routines from
  // one it could not reach, and it offers onboarding to both.
  test('records that a load failed, and that the next one did not', async () => {
    getDashboardMock.mockResolvedValue(undefined)
    await store().load()

    expect(store().failed).toBe(true)

    getDashboardMock.mockResolvedValue(response({ nextRoutine: { id: 'r1' } }))
    await store().load()

    expect(store().failed).toBe(false)
  })

  test('clears the loading flag even when the request fails', async () => {
    getDashboardMock.mockRejectedValue(new Error('offline'))

    await expect(store().load()).rejects.toThrow('offline')

    expect(store().loading).toBe(false)
  })

  // The response is server state; only the choice of routine is worth keeping.
  test('persists the chosen routine and nothing else', async () => {
    getDashboardMock.mockResolvedValue(response({ nextRoutine: { id: 'r1', name: 'Push' } }))

    await store().load()

    const persisted = JSON.parse(localStorage.getItem('dashboard') ?? '{}')
    expect(persisted.state).toEqual({ preferredRoutineId: 'r1' })
  })
})
