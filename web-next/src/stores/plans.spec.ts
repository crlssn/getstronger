import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', () => ({
  createPlan: vi.fn(),
  deletePlan: vi.fn(),
  listPlans: vi.fn(),
  pauseActivePlan: vi.fn(),
  setActivePlan: vi.fn(),
  skipPlanRoutine: vi.fn(),
  updatePlan: vi.fn(),
}))

import * as requests from '@/http/requests'
import { selectActivePlan, usePlanStore } from './plans'

const mocked = {
  createPlan: vi.mocked(requests.createPlan),
  deletePlan: vi.mocked(requests.deletePlan),
  listPlans: vi.mocked(requests.listPlans),
  pauseActivePlan: vi.mocked(requests.pauseActivePlan),
  setActivePlan: vi.mocked(requests.setActivePlan),
  skipPlanRoutine: vi.mocked(requests.skipPlanRoutine),
  updatePlan: vi.mocked(requests.updatePlan),
}

const store = () => usePlanStore.getState()

const plan = (id: string, fields: Record<string, unknown> = {}) =>
  ({ id, name: id, active: false, ...fields }) as never

const seed = (...plans: unknown[]) => usePlanStore.setState({ plans: plans as never })

describe('plan store', () => {
  beforeEach(() => {
    usePlanStore.setState({ plans: [], loading: false })
    Object.values(mocked).forEach((mock) => mock.mockReset())
  })

  test('loads the plans', async () => {
    mocked.listPlans.mockResolvedValue({ plans: [plan('p1')] } as never)

    await store().load()

    expect(store().plans).toHaveLength(1)
    expect(store().loading).toBe(false)
  })

  test('keeps the plans it had when a load fails', async () => {
    seed(plan('p1'))
    mocked.listPlans.mockResolvedValue(undefined)

    await store().load()

    expect(store().plans).toHaveLength(1)
  })

  test('clears the loading flag even when the request throws', async () => {
    mocked.listPlans.mockRejectedValue(new Error('offline'))

    await expect(store().load()).rejects.toThrow('offline')

    expect(store().loading).toBe(false)
  })

  // Newest first, matching the order the list is shown in.
  test('puts a created plan at the top', async () => {
    seed(plan('p1'))
    mocked.createPlan.mockResolvedValue({ plan: plan('p2') } as never)

    await expect(store().create('Block', ['r1'])).resolves.toMatchObject({ id: 'p2' })

    expect(store().plans.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  test('replaces an updated plan in place', async () => {
    seed(plan('p1'), plan('p2'))
    mocked.updatePlan.mockResolvedValue({ plan: plan('p1', { name: 'Renamed' }) } as never)

    await store().update('p1', 'Renamed', ['r1'])

    expect(store().plans.map((p) => p.name)).toEqual(['Renamed', 'p2'])
  })

  test('removes a deleted plan', async () => {
    seed(plan('p1'), plan('p2'))
    mocked.deletePlan.mockResolvedValue({} as never)

    await expect(store().remove('p1')).resolves.toBe(true)

    expect(store().plans.map((p) => p.id)).toEqual(['p2'])
  })

  test('leaves the list alone when a delete fails', async () => {
    seed(plan('p1'))
    mocked.deletePlan.mockResolvedValue(undefined)

    await expect(store().remove('p1')).resolves.toBe(false)

    expect(store().plans).toHaveLength(1)
  })

  // Only one plan runs at a time, so activating one stands the others down
  // here rather than waiting for the next load.
  test('activating a plan deactivates the rest', async () => {
    seed(plan('p1', { active: true }), plan('p2'))
    mocked.setActivePlan.mockResolvedValue({ plan: plan('p2', { active: true }) } as never)

    await store().activate('p2')

    expect(selectActivePlan(store())?.id).toBe('p2')
    expect(store().plans.filter((p) => p.active)).toHaveLength(1)
  })

  test('pausing deactivates every plan', async () => {
    seed(plan('p1', { active: true }), plan('p2'))
    mocked.pauseActivePlan.mockResolvedValue({} as never)

    await expect(store().pause()).resolves.toBe(true)

    expect(selectActivePlan(store())).toBeUndefined()
  })

  test('skipping advances the plan in place', async () => {
    seed(plan('p1'), plan('p2'))
    mocked.skipPlanRoutine.mockResolvedValue({ plan: plan('p1', { name: 'Advanced' }) } as never)

    await store().skip('p1')

    expect(store().plans.map((p) => p.name)).toEqual(['Advanced', 'p2'])
  })

  // A refused mutation must not leave the list showing a change the server
  // never made.
  test.each([
    ['create', () => store().create('Block', ['r1'])],
    ['update', () => store().update('p1', 'Block', ['r1'])],
    ['activate', () => store().activate('p1')],
    ['skip', () => store().skip('p1')],
  ])('%s leaves the list alone when the server returns nothing', async (_name, invoke) => {
    seed(plan('p1'))
    Object.values(mocked).forEach((mock) => mock.mockResolvedValue(undefined as never))

    await expect(invoke()).resolves.toBeUndefined()

    expect(store().plans).toEqual([expect.objectContaining({ id: 'p1' })])
  })
})
