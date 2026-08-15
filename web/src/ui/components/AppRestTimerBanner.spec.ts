// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useWorkoutStore } from '@/stores/workout'
import AppRestTimerBanner from '@/ui/components/AppRestTimerBanner.vue'

const soundMocks = vi.hoisted(() => ({
  finished: vi.fn(async () => true),
  getReady: vi.fn(async () => true),
  unlock: vi.fn(async () => true),
}))

vi.mock('@/utils/restSound', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/restSound')>()
  return {
    ...original,
    playRestFinishedSound: soundMocks.finished,
    playRestGetReadySound: soundMocks.getReady,
    unlockRestSound: soundMocks.unlock,
  }
})

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, name: 'home', path: '/home' },
      {
        component: { template: '<div />' },
        name: 'workout-routine',
        path: '/workouts/routine/:routine_id',
      },
    ],
  })

const seedActiveWorkout = (restTimerEndsAt: string, restTimerTotalSeconds: number) => {
  const workoutStore = useWorkoutStore()
  workoutStore.workouts['routine-id'] = {
    exerciseSets: { 'exercise-id': [{ reps: 8, weight: 42.5 }] },
    restTimerEndsAt,
    restTimerTotalSeconds,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
  }
  return workoutStore
}

describe('AppRestTimerBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  test('shows the running timer and a link back to the workout on other pages', async () => {
    const router = createTestRouter()
    await router.push('/home')
    seedActiveWorkout(new Date(Date.now() + 90_000).toISOString(), 90)

    const wrapper = mount(AppRestTimerBanner, {
      global: { plugins: [i18n, router] },
    })

    expect(wrapper.get('.rest-copy strong').text()).toBe('01:30')
    expect(wrapper.get('a').text()).toContain('Go to workout')
    expect(wrapper.get('a').attributes('href')).toBe('/workouts/routine/routine-id')
    wrapper.unmount()
  })

  test('keeps counting and playing cues while hidden on the active workout page', async () => {
    const router = createTestRouter()
    await router.push('/home')
    const workoutStore = seedActiveWorkout(new Date(Date.now() + 11_000).toISOString(), 11)
    class AudioContextStub {
      close = vi.fn(async () => undefined)
      state = 'running'
    }
    vi.stubGlobal('AudioContext', AudioContextStub)

    const wrapper = mount(AppRestTimerBanner, {
      global: { plugins: [i18n, router] },
    })
    window.dispatchEvent(new Event('pointerdown'))
    await flushPromises()
    await router.push('/workouts/routine/routine-id')

    expect(wrapper.find('.rest-banner').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(soundMocks.getReady).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(soundMocks.finished).toHaveBeenCalledOnce()
    expect(workoutStore.getRestTimer('routine-id').endsAt).toBeUndefined()

    wrapper.unmount()
  })

  test('returns to the active workout when the rest timer ends on another page', async () => {
    const router = createTestRouter()
    await router.push('/home')
    seedActiveWorkout(new Date(Date.now() + 1_000).toISOString(), 1)

    const wrapper = mount(AppRestTimerBanner, {
      global: { plugins: [i18n, router] },
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/workouts/routine/routine-id')
    wrapper.unmount()
  })
})
