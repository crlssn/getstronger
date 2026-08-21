// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'

import { i18n } from '@/i18n'
import { ExerciseMetric, ExerciseSchema, ExerciseSetsSchema } from '@/proto/api/v1/shared_pb'
import { WorkoutSchema, type Workout } from '@/proto/api/v1/workout_service_pb'
import { useAuthStore } from '@/stores/auth'
import EditWorkout from '@/ui/workouts/EditWorkout.vue'

const { getWorkout, routerPush, updateWorkout } = vi.hoisted(() => ({
  getWorkout: vi.fn(),
  routerPush: vi.fn(),
  updateWorkout: vi.fn(),
}))

vi.mock('@/http/requests.ts', () => ({ getWorkout, updateWorkout }))

vi.mock('@/router/router', () => ({
  default: { push: routerPush },
}))

const ownerID = 'user-owner'
const workout: Workout = create(WorkoutSchema, {
  exerciseSets: [
    create(ExerciseSetsSchema, {
      exercise: create(ExerciseSchema, {
        id: 'exercise-bench',
        metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
        name: 'Bench Press',
      }),
      sets: [{ reps: 8, weight: 80 }],
    }),
  ],
  id: 'workout-1',
  name: 'Push Day',
  user: { id: ownerID },
})

const mountEdit = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: EditWorkout, name: 'edit-workout', path: '/workouts/:id/edit' },
      { component: { template: '<div />' }, name: 'view-workout', path: '/workouts/:id' },
    ],
  })
  await router.push(`/workouts/${workout.id}/edit`)
  await router.isReady()
  useAuthStore().userId = ownerID
  return mount(EditWorkout, { global: { plugins: [i18n, router] } })
}

describe('EditWorkout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getWorkout.mockReset()
    routerPush.mockReset()
  })

  test('shows the loading skeleton until the workout arrives', async () => {
    let resolveWorkout!: (value: { workout: Workout }) => void
    getWorkout.mockReturnValue(
      new Promise<{ workout: Workout }>((resolve) => {
        resolveWorkout = resolve
      }),
    )

    const wrapper = await mountEdit()
    await flushPromises()

    // The design system's rule: every screen that fetches shows the shared
    // skeleton, never a blank page.
    expect(wrapper.find('.loading-card').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)

    resolveWorkout({ workout })
    await flushPromises()

    expect(wrapper.find('.loading-card').exists()).toBe(false)
    expect(wrapper.find('form.edit-workout-form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Bench Press')
    wrapper.unmount()
  })
})
