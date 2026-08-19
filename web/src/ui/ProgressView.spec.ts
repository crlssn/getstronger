// @vitest-environment jsdom

import { DateTime } from 'luxon'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import ProgressView from '@/ui/ProgressView.vue'

const { getDashboard, listWorkouts } = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  listWorkouts: vi.fn(),
}))

vi.mock('@/http/requests', () => ({
  getDashboard,
  listWorkouts,
}))

// The chart itself is canvas territory; the test cares that the right
// workouts reach it, so the stub renders the count it received.
const chartStub = {
  props: ['workouts'],
  template: '<div data-testid="chart">{{ workouts.length }}</div>',
}

const workoutDaysAgo = (daysAgo: number, intensity: number) => ({
  finishedAt: {
    seconds: BigInt(Math.floor(DateTime.now().minus({ days: daysAgo }).toSeconds())),
  },
  intensity,
  exerciseSets: [],
})

const page = (workouts: object[], nextPageToken = new Uint8Array(0)) => ({
  workouts,
  pagination: { nextPageToken },
})

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, name: 'progress', path: '/progress' },
      { component: { template: '<div />' }, name: 'workout', path: '/workout' },
      { component: { template: '<div />' }, path: '/exercises/:id' },
    ],
  })

const mountProgress = async () => {
  const router = createTestRouter()
  await router.push('/progress')
  const wrapper = mount(ProgressView, {
    global: {
      plugins: [i18n, router],
      stubs: { WorkoutChart: chartStub },
    },
  })
  await flushPromises()
  return wrapper
}

const rangeButton = (wrapper: Awaited<ReturnType<typeof mountProgress>>, label: string) => {
  const button = wrapper
    .findAll('.period-picker button')
    .find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`no range button labelled ${label}`)
  return button
}

const selectRange = async (wrapper: Awaited<ReturnType<typeof mountProgress>>, label: string) => {
  await rangeButton(wrapper, label).trigger('click')
}

const expectRange = (
  wrapper: Awaited<ReturnType<typeof mountProgress>>,
  label: string,
  workoutCount: number,
) => {
  for (const button of wrapper.findAll('.period-picker button')) {
    expect(button.attributes('aria-pressed')).toBe(String(button.text() === label))
  }
  expect(wrapper.get('[data-testid="chart"]').text()).toBe(String(workoutCount))
}

describe('ProgressView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().userId = 'user-1'
    getDashboard.mockResolvedValue({ recentWorkouts: [], personalBests: [], volumeThisWeek: 0 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('every range updates the selected state and the chart, in any order', async () => {
    // One workout per range bucket: only the 1Y view sees all four.
    listWorkouts.mockResolvedValue(
      page([
        workoutDaysAgo(2, 100),
        workoutDaysAgo(20, 200),
        workoutDaysAgo(60, 300),
        workoutDaysAgo(200, 400),
      ]),
    )
    const wrapper = await mountProgress()

    expectRange(wrapper, '4W', 2)

    const sequence: [string, number][] = [
      ['7D', 1],
      ['4W', 2],
      ['3M', 3],
      ['1Y', 4],
      // Returning to earlier ranges and repeating a selection must keep
      // producing the same data, not the last range's.
      ['4W', 2],
      ['7D', 1],
      ['7D', 1],
      ['1Y', 4],
    ]
    for (const [label, workoutCount] of sequence) {
      await selectRange(wrapper, label)
      expectRange(wrapper, label, workoutCount)
    }
  })

  test('a range with no data keeps the picker and says so instead of vanishing', async () => {
    listWorkouts.mockResolvedValue(page([workoutDaysAgo(60, 300)]))
    const wrapper = await mountProgress()

    await selectRange(wrapper, '7D')

    expect(wrapper.find('[data-testid="chart"]').exists()).toBe(false)
    expect(wrapper.get('.chart-empty').text()).toBe('No workouts in this period.')
    expect(rangeButton(wrapper, '7D').attributes('aria-pressed')).toBe('true')

    await selectRange(wrapper, '3M')
    expectRange(wrapper, '3M', 1)
  })

  test('pages through the workout history until the widest range is covered', async () => {
    const nextPage = new Uint8Array([1])
    listWorkouts
      .mockResolvedValueOnce(page([workoutDaysAgo(2, 100)], nextPage))
      // The second page crosses the one-year cutoff, so no third request.
      .mockResolvedValueOnce(page([workoutDaysAgo(300, 200), workoutDaysAgo(400, 300)], nextPage))
    const wrapper = await mountProgress()

    expect(listWorkouts).toHaveBeenCalledTimes(2)
    expect(listWorkouts).toHaveBeenLastCalledWith(['user-1'], nextPage, 100)

    await selectRange(wrapper, '1Y')
    expectRange(wrapper, '1Y', 2)
  })
})
