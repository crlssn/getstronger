// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { signup } = vi.hoisted(() => ({ signup: vi.fn() }))

vi.mock('@/http/requests', () => ({ signup }))
vi.mock('@/posthog', () => ({ default: { capture: vi.fn() } }))

import { i18n } from '@/i18n'
import UserSignup from '@/ui/auth/UserSignup.vue'

const mountSignup = async () => {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: UserSignup, name: 'signup', path: '/signup' },
      { component: { template: '<div />' }, name: 'login', path: '/login' },
      {
        component: { template: '<div />' },
        name: 'verify-email-pending',
        path: '/verify-email/pending',
      },
    ],
  })
  await router.push('/signup')
  await router.isReady()

  return mount(UserSignup, { global: { plugins: [router, i18n] } })
}

describe('UserSignup', () => {
  beforeEach(() => {
    signup.mockReset()
  })

  test('suggests a username from the name as it is typed', async () => {
    const wrapper = await mountSignup()
    const username = wrapper.get<HTMLInputElement>('#username')

    await wrapper.get('#name').setValue('Al')
    // Two characters cannot be a username, so nothing is suggested yet.
    expect(username.element.value).toBe('')

    await wrapper.get('#name').setValue('Alex Morgan')
    expect(username.element.value).toBe('alexmorgan')
  })

  test('leaves a username alone once it has been typed in', async () => {
    const wrapper = await mountSignup()
    const username = wrapper.get<HTMLInputElement>('#username')

    await wrapper.get('#name').setValue('Alex Morgan')
    await username.setValue('AlexM')
    await wrapper.get('#name').setValue('Alex Morgan-Reid')

    expect(username.element.value).toBe('alexm')
  })

  test('suggests again once the username is cleared', async () => {
    const wrapper = await mountSignup()
    const username = wrapper.get<HTMLInputElement>('#username')

    await wrapper.get('#name').setValue('Alex Morgan')
    await username.setValue('alexm')
    await username.setValue('')
    await wrapper.get('#name').setValue('Robin Fields')

    expect(username.element.value).toBe('robinfields')
  })
})
