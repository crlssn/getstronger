// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'

import { i18n } from '@/i18n'
import { UserSchema } from '@/proto/api/v1/shared_pb'
import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { useAuthStore } from '@/stores/auth'
import UserView from '@/ui/users/UserView.vue'

const { followUser, getUser, listWorkouts, unfollowUser } = vi.hoisted(() => ({
  followUser: vi.fn(),
  getUser: vi.fn(),
  listWorkouts: vi.fn(),
  unfollowUser: vi.fn(),
}))

vi.mock('@/http/requests.ts', () => ({ followUser, getUser, listWorkouts, unfollowUser }))

const alice = create(UserSchema, { followed: true, id: 'user-a', name: 'Alice' })
const bob = create(UserSchema, { followed: true, id: 'user-b', name: 'Bob' })

// Two workouts is the chart's minimum: "we need at least two data points".
const aliceWorkouts = [
  create(WorkoutSchema, { id: 'workout-1', user: alice }),
  create(WorkoutSchema, { id: 'workout-2', user: alice }),
]

describe('UserView', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    // The profile actions menu teleports into the page header's action slot.
    document.body.innerHTML = '<div id="page-nav-action"></div>'
    useAuthStore().userId = 'user-me'

    getUser.mockImplementation(async (id: string) => ({
      user: [alice, bob].find((user) => user.id === id),
    }))
    listWorkouts.mockImplementation(async (userIds: string[]) => ({
      workouts: userIds[0] === alice.id ? aliceWorkouts : [],
    }))

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: { template: '<div />' }, path: '/users/:id' },
        { component: { template: '<div />' }, path: '/:pathMatch(.*)*' },
      ],
    })
    await router.push(`/users/${alice.id}`)
    await router.isReady()
  })

  const mountView = async () => {
    const wrapper = mount(UserView, {
      global: { plugins: [i18n, router], stubs: { WorkoutChart: true } },
    })
    await flushPromises()
    return wrapper
  }

  test('replaces the trend chart when navigating to another profile', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('workout-chart-stub').exists()).toBe(true)

    await router.push(`/users/${bob.id}`)
    await flushPromises()

    // Bob has no workouts, so Alice's trend chart must not linger on his page.
    expect(getUser).toHaveBeenLastCalledWith(bob.id)
    expect(listWorkouts).toHaveBeenLastCalledWith([bob.id], expect.anything())
    expect(wrapper.find('workout-chart-stub').exists()).toBe(false)
    wrapper.unmount()
  })
})
