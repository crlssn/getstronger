// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import AppDashboard from '@/ui/components/AppDashboard.vue'

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
      { component: { template: '<div />' }, name: 'progress', path: '/progress' },
    ],
  })

const mountDashboard = async (path: string) => {
  const router = createTestRouter()
  await router.push(path)
  const wrapper = mount(AppDashboard, {
    global: { plugins: [i18n, router] },
  })
  return wrapper
}

describe('AppDashboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  test.each(['/workouts/routine/routine-id', '/workouts/quick'])(
    'hides the global tab bar during the active workout on %s',
    async (path) => {
      const wrapper = await mountDashboard(path)

      expect(wrapper.find('.bottom-nav').exists()).toBe(false)
      expect(wrapper.get('.dashboard-shell').classes()).toContain('focused-shell')
      wrapper.unmount()
    },
  )

  test.each(['/home', '/workout', '/progress'])('shows the global tab bar on %s', async (path) => {
    const wrapper = await mountDashboard(path)

    expect(wrapper.find('.bottom-nav').exists()).toBe(true)
    expect(wrapper.get('.dashboard-shell').classes()).not.toContain('focused-shell')
    wrapper.unmount()
  })

  test.each(['/workouts/routine/routine-id', '/workouts/quick'])(
    'keeps the top navigation hidden on %s',
    async (path) => {
      const wrapper = await mountDashboard(path)

      expect(wrapper.find('.page-nav').exists()).toBe(false)
      wrapper.unmount()
    },
  )

  test('shows the top navigation on non-tab pages', async () => {
    const wrapper = await mountDashboard('/progress')

    expect(wrapper.find('.page-nav').exists()).toBe(true)
    wrapper.unmount()
  })
})
