// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import AppNavBottom from '@/ui/components/AppNavBottom.vue'

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, name: 'home', path: '/home' },
      { component: { template: '<div />' }, name: 'workout', path: '/workout' },
      {
        component: { template: '<div />' },
        name: 'workout-routine',
        path: '/workouts/routine/:id',
      },
      { component: { template: '<div />' }, name: 'quick-workout', path: '/workouts/quick' },
      { component: { template: '<div />' }, name: 'plans', path: '/plans' },
      { component: { template: '<div />' }, name: 'exercises', path: '/exercises' },
      { component: { template: '<div />' }, name: 'profile', path: '/profile' },
    ],
  })

describe('AppNavBottom', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  test.each(['/workouts/routine/routine-id', '/workouts/quick'])(
    'joins the active-workout action dock on %s',
    async (path) => {
      const router = createTestRouter()
      await router.push(path)

      const wrapper = mount(AppNavBottom, {
        global: { plugins: [i18n, router] },
      })

      expect(wrapper.get('nav').classes()).toContain('joined-to-workout-actions')
      wrapper.unmount()
    },
  )

  test('keeps its standalone shape outside an active workout', async () => {
    const router = createTestRouter()
    await router.push('/workout')

    const wrapper = mount(AppNavBottom, {
      global: { plugins: [i18n, router] },
    })

    expect(wrapper.get('nav').classes()).not.toContain('joined-to-workout-actions')
    wrapper.unmount()
  })
})
