// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { resendVerificationEmail } = vi.hoisted(() => ({ resendVerificationEmail: vi.fn() }))

vi.mock('@/http/requests', () => ({ resendVerificationEmail }))

import { en, sv } from '@/i18n/messages'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import VerifyEmailPending from '@/ui/auth/VerifyEmailPending.vue'

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, name: 'login', path: '/login' },
      { component: { template: '<div />' }, name: 'signup', path: '/signup' },
      {
        component: VerifyEmailPending,
        name: 'verify-email-pending',
        path: '/verify-email/pending',
      },
    ],
  })

const mountPage = async (locale: 'en' | 'sv' = 'en') => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createTestRouter()
  await router.push('/verify-email/pending')

  const i18n = createI18n({
    fallbackLocale: 'en',
    legacy: false,
    locale: locale,
    messages: { en, sv },
  })

  return mount(VerifyEmailPending, { global: { plugins: [pinia, router, i18n] } })
}

const resendButton = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper.get('button[type="submit"]')

describe('VerifyEmailPending', () => {
  beforeEach(() => {
    resendVerificationEmail.mockReset()
    resendVerificationEmail.mockResolvedValue({ retryAfterSeconds: 60 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('describes a pending state instead of a completed one', async () => {
    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    // The state is carried by words and an icon, never by colour alone.
    expect(wrapper.text()).toContain(en.auth.verification.pendingLabel)
    expect(wrapper.text()).toContain(en.auth.verification.instructions)
    expect(wrapper.find('.verification-pending-icon').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('verified your email')
    wrapper.unmount()
  })

  test('shows the destination masked rather than in full', async () => {
    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    expect(wrapper.text()).toContain('a••••••••n@example.com')
    expect(wrapper.text()).not.toContain('alex.morgan@example.com')
    wrapper.unmount()
  })

  test('asks for an address when the pending one is unknown', async () => {
    const wrapper = await mountPage()

    const input = wrapper.get('#verification-email')
    expect(wrapper.get('label[for="verification-email"]').text()).toBe(en.auth.email)
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()

    await input.setValue('alex.morgan@example.com')
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  test('reports progress while the link is being sent', async () => {
    let resolveResend: (value: { retryAfterSeconds: number }) => void = () => {}
    resendVerificationEmail.mockReturnValue(
      new Promise<{ retryAfterSeconds: number }>((resolve) => {
        resolveResend = resolve
      }),
    )

    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    await resendButton(wrapper).trigger('submit')
    expect(resendButton(wrapper).attributes('aria-busy')).toBe('true')
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="status"]').text()).toBe(en.auth.verification.resending)

    resolveResend({ retryAfterSeconds: 60 })
    await flushPromises()
    expect(resendVerificationEmail).toHaveBeenCalledWith('alex.morgan@example.com')
    wrapper.unmount()
  })

  test('confirms the resend without disclosing whether the address is registered', async () => {
    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    await resendButton(wrapper).trigger('submit')
    await flushPromises()

    const status = wrapper.get('[role="status"]')
    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.text()).toBe(en.auth.verification.resent)
    wrapper.unmount()
  })

  test('counts down a cooldown before another link can be sent', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    await resendButton(wrapper).trigger('submit')
    await flushPromises()

    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()
    expect(resendButton(wrapper).text()).toBe('Send again in 60s')

    await vi.advanceTimersByTimeAsync(59_000)
    expect(resendButton(wrapper).text()).toBe('Send again in 1s')
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(resendButton(wrapper).text()).toBe(en.auth.verification.resend)
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(resendVerificationEmail).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  test('keeps the cooldown after a reload of the pending page', async () => {
    vi.useFakeTimers()
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEmailVerificationStore()
    // Session storage restores the address and the moment the last link was
    // sent, which is what a reload of this page looks like.
    store.markSent('alex.morgan@example.com', 60)

    const router = createTestRouter()
    await router.push('/verify-email/pending')
    const i18n = createI18n({
      fallbackLocale: 'en',
      legacy: false,
      locale: 'en',
      messages: { en, sv },
    })
    const wrapper = mount(VerifyEmailPending, { global: { plugins: [pinia, router, i18n] } })

    expect(wrapper.find('#verification-email').exists()).toBe(false)
    expect(resendButton(wrapper).text()).toBe('Send again in 60s')
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  test('offers a retry when the link could not be sent', async () => {
    resendVerificationEmail.mockResolvedValue(undefined)

    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    await resendButton(wrapper).trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(en.auth.verification.resendFailed)
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(resendButton(wrapper).text()).toBe(en.auth.verification.resend)
    wrapper.unmount()
  })

  test('keeps a way to correct the address and to return to login', async () => {
    const wrapper = await mountPage()
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    const links = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(links).toContain('/signup')
    expect(links).toContain('/login')
    expect(wrapper.text()).toContain(en.auth.verification.differentEmail)
    wrapper.unmount()
  })

  test('translates the notice and its actions', async () => {
    const wrapper = await mountPage('sv')
    useEmailVerificationStore().setPendingEmail('alex.morgan@example.com')
    await flushPromises()

    expect(wrapper.text()).toContain(sv.auth.verification.pendingLabel)
    expect(wrapper.text()).toContain(sv.auth.verification.instructions)
    expect(resendButton(wrapper).text()).toBe(sv.auth.verification.resend)
    expect(wrapper.text()).not.toContain(en.auth.verification.pendingLabel)
    wrapper.unmount()
  })
})
