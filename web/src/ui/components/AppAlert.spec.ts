// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useAlertStore } from '@/stores/alerts'
import AppAlert from '@/ui/components/AppAlert.vue'

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, path: '/first' },
      { component: { template: '<div />' }, path: '/second' },
      { component: { template: '<div />' }, path: '/third' },
    ],
  })

describe('AppAlert', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('stays visible until the current page changes', async () => {
    vi.useFakeTimers()
    const pinia = createPinia()
    const router = createTestRouter()
    setActivePinia(pinia)
    await router.push('/first')

    const wrapper = mount(AppAlert, {
      global: { plugins: [pinia, router] },
    })
    const alertStore = useAlertStore()

    alertStore.setSuccessWithoutPageRefresh('Workout saved')
    await flushPromises()
    expect(wrapper.get('.alert-region').classes()).toContain('full-width')
    expect(wrapper.get('[role="status"]').text()).toContain('Workout saved')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.get('[role="status"]').text()).toContain('Workout saved')

    await router.push('/second')
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })

  test('stays on the destination page when set immediately before navigation', async () => {
    const pinia = createPinia()
    const router = createTestRouter()
    setActivePinia(pinia)
    await router.push('/first')

    const wrapper = mount(AppAlert, {
      global: { plugins: [pinia, router] },
    })
    const alertStore = useAlertStore()

    alertStore.setSuccess('Workout saved')
    await router.push('/second')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Workout saved')

    await router.push('/third')
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
