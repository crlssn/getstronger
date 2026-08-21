// @vitest-environment jsdom

import type { ResendVerificationEmailResponse } from '@/proto/api/v1/auth_service_pb'

import { create } from '@bufbuild/protobuf'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  resendVerificationEmail: vi.fn(),
}))

import * as requests from '@/http/requests'
import { i18n } from '@/i18n'
import { en, sv } from '@/i18n/messages'
import { ResendVerificationEmailResponseSchema } from '@/proto/api/v1/auth_service_pb'
import { defaultResendCooldownSeconds, useEmailVerificationStore } from '@/stores/emailVerification'
import { renderWithProviders } from '@/ui/testing'
import { VerifyEmailPending } from './VerifyEmailPending'

const resend = vi.mocked(requests.resendVerificationEmail)

const cooldown = (retryAfterSeconds: number) =>
  create(ResendVerificationEmailResponseSchema, { retryAfterSeconds })

const cleared = {
  pendingEmail: '',
  lastSentAt: 0,
  retryAfterSeconds: defaultResendCooldownSeconds,
}

const resendButton = () => screen.getByRole('button')

const render = () => renderWithProviders(<VerifyEmailPending />, { route: '/verify-email/pending' })

describe('VerifyEmailPending', () => {
  beforeEach(() => {
    resend.mockReset()
    resend.mockResolvedValue(cooldown(60))
    useEmailVerificationStore.setState(cleared)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await i18n.changeLanguage('en')
  })

  test('describes a pending state instead of a completed one', () => {
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    // The state is carried by words and an icon, never by colour alone.
    expect(screen.getByText(en.auth.verification.pendingLabel)).toBeInTheDocument()
    expect(screen.getByText(en.auth.verification.instructions)).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('verified your email')
  })

  test('shows the destination masked rather than in full', () => {
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    expect(document.body).toHaveTextContent('a••••••••n@example.com')
    expect(document.body).not.toHaveTextContent('alex.morgan@example.com')
  })

  test('asks for an address when the pending one is unknown', async () => {
    render()

    expect(screen.getByText(en.auth.verification.unknownDestination)).toBeInTheDocument()
    expect(resendButton()).toBeDisabled()

    await userEvent.type(screen.getByLabelText(en.auth.email), 'alex.morgan@example.com')
    expect(resendButton()).toBeEnabled()
  })

  test('reports progress while the link is being sent', async () => {
    let finish: (value: ResendVerificationEmailResponse) => void = () => {}
    resend.mockReturnValue(
      new Promise<ResendVerificationEmailResponse>((resolve) => {
        finish = resolve
      }),
    )

    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    await userEvent.click(resendButton())
    expect(resendButton()).toHaveAttribute('aria-busy', 'true')
    expect(resendButton()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(en.auth.verification.resending)

    await act(async () => {
      finish(cooldown(60))
    })
    expect(resend).toHaveBeenCalledWith('alex.morgan@example.com')
  })

  test('confirms the resend without disclosing whether the address is registered', async () => {
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    await userEvent.click(resendButton())

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent(en.auth.verification.resent)
  })

  test('counts down a cooldown before another link can be sent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    await userEvent.click(resendButton())

    expect(resendButton()).toBeDisabled()
    expect(resendButton()).toHaveTextContent('Send again in 60s')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000)
    })
    expect(resendButton()).toHaveTextContent('Send again in 1s')
    expect(resendButton()).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(resendButton()).toHaveTextContent(en.auth.verification.resend)
    expect(resendButton()).toBeEnabled()
    expect(resend).toHaveBeenCalledTimes(1)
  })

  test('keeps the cooldown after a reload of the pending page', () => {
    vi.useFakeTimers()
    // Session storage restores the address and the moment the last link was
    // sent, which is what a reload of this page looks like.
    useEmailVerificationStore.getState().markSent('alex.morgan@example.com', 60)
    render()

    expect(screen.queryByLabelText(en.auth.email)).not.toBeInTheDocument()
    expect(resendButton()).toHaveTextContent('Send again in 60s')
    expect(resendButton()).toBeDisabled()
  })

  test('offers a retry when the link could not be sent', async () => {
    resend.mockResolvedValue(undefined)
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    await userEvent.click(resendButton())

    expect(screen.getByRole('alert')).toHaveTextContent(en.auth.verification.resendFailed)
    expect(resendButton()).toBeEnabled()
    expect(resendButton()).toHaveTextContent(en.auth.verification.resend)
  })

  test('keeps a way to correct the address and to return to login', () => {
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    expect(screen.getByRole('link', { name: en.auth.verification.differentEmail })).toHaveAttribute(
      'href',
      '/signup',
    )
    expect(screen.getByRole('link', { name: en.auth.verification.backToLogin })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  test('translates the notice and its actions', async () => {
    await i18n.changeLanguage('sv')
    useEmailVerificationStore.setState({ pendingEmail: 'alex.morgan@example.com' })
    render()

    expect(screen.getByText(sv.auth.verification.pendingLabel)).toBeInTheDocument()
    expect(screen.getByText(sv.auth.verification.instructions)).toBeInTheDocument()
    expect(resendButton()).toHaveTextContent(sv.auth.verification.resend)
    expect(document.body).not.toHaveTextContent(en.auth.verification.pendingLabel)
  })
})
