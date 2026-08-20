// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

vi.mock('@/http/clients', () => ({
  workoutClient: { createWorkout: vi.fn() },
}))

import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { WorkoutService, CreateWorkoutRequestSchema } from '@/proto/api/v1/workout_service_pb'
import { create } from '@bufbuild/protobuf'
import AppOfflineBanner from './AppOfflineBanner.vue'

const mountBanner = () => mount(AppOfflineBanner, { global: { plugins: [i18n] } })

describe('AppOfflineBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  test('stays hidden while online', () => {
    expect(mountBanner().find('.offline-banner').exists()).toBe(false)
  })

  test('tells the user they are offline and seeing saved data', async () => {
    const wrapper = mountBanner()

    useConnectionStore().setOnline(false)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[role="status"]').text()).toContain('offline')
  })

  test('drops the queued changes when the user logs out', async () => {
    const authStore = useAuthStore()
    authStore.userId = 'user-1'
    authStore.accessToken = 'token'
    const wrapper = mountBanner()
    const mutationQueueStore = useMutationQueueStore()
    mutationQueueStore.enqueue(
      WorkoutService.method.createWorkout,
      create(CreateWorkoutRequestSchema, { routineId: 'r1' }),
    )

    authStore.logout()
    await wrapper.vm.$nextTick()

    expect(mutationQueueStore.pending).toHaveLength(0)
  })
})
