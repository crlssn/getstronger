// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'

import { i18n } from '@/i18n'
import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import CardWorkout from '@/ui/components/CardWorkout.vue'

const { deleteWorkout, postWorkoutComment } = vi.hoisted(() => ({
  deleteWorkout: vi.fn(),
  postWorkoutComment: vi.fn(),
}))

vi.mock('@/http/requests', () => ({ deleteWorkout, postWorkoutComment }))

// Headless UI's menu observes its panel for resizes; jsdom has no
// ResizeObserver, so give it an inert one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)

const ownerID = 'user-owner'
const workout = create(WorkoutSchema, {
  id: 'workout-1',
  name: 'Push Day',
  user: { id: ownerID, name: 'Alice Lifter' },
})

describe('CardWorkout', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    useAuthStore().userId = ownerID
    deleteWorkout.mockResolvedValue({})

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: { template: '<div />' }, path: '/home' },
        { component: { template: '<div />' }, path: '/:pathMatch(.*)*' },
      ],
    })
    await router.push(`/workouts/${workout.id}`)
    await router.isReady()
  })

  const deleteViaMenu = async (compact: boolean) => {
    const wrapper = mount(CardWorkout, {
      global: { plugins: [i18n, router] },
      props: { compact, workout },
    })
    await flushPromises()

    await wrapper.get('button[aria-label="Workout actions"]').trigger('click')
    const deleteItem = wrapper
      .findAll('.menu-item')
      .find((item) => item.text() === 'Delete workout')
    expect(deleteItem).toBeTruthy()
    await deleteItem!.trigger('click')

    useConfirmationStore().accept()
    await flushPromises()
    return wrapper
  }

  test('announces a deletion from the full view as a success that survives going home', async () => {
    const wrapper = await deleteViaMenu(false)

    const alert = useAlertStore().alert
    expect(alert?.type).toBe('success')
    // The card navigates home, so the alert must survive that route change.
    expect(alert?.seen).toBe(false)
    expect(router.currentRoute.value.path).toBe('/home')
    wrapper.unmount()
  })

  test('announces a deletion from the feed as a success on the spot', async () => {
    const wrapper = await deleteViaMenu(true)

    const alert = useAlertStore().alert
    expect(alert?.type).toBe('success')
    expect(alert?.seen).toBe(true)
    expect(router.currentRoute.value.path).toBe(`/workouts/${workout.id}`)
    wrapper.unmount()
  })
})
