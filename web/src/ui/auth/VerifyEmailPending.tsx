import { ClockIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { resendVerificationEmail } from '@/http/requests'
import { selectHasPendingEmail, useEmailVerificationStore } from '@/stores/emailVerification'
import { AppButton } from '@/ui/components/AppButton'
import { AppInput } from '@/ui/components/AppInput'
import { maskEmail } from '@/utils/maskEmail'
import styles from './VerifyEmailPending.module.css'

type ResendStatus = 'failed' | 'idle' | 'sending' | 'sent'

const cooldownRemaining = (now: number, lastSentAt: number, retryAfterSeconds: number) => {
  if (!lastSentAt) return 0
  const elapsed = (now - lastSentAt) / 1000
  return Math.max(0, Math.ceil(retryAfterSeconds - elapsed))
}

/**
 * The holding screen for an account that has signed up but not verified yet.
 *
 * Its whole job is the resend: it says what is being waited on, and offers one
 * new link at a time behind the cooldown the server reports.
 */
export const VerifyEmailPending = () => {
  const { t } = useTranslation()

  const pendingEmail = useEmailVerificationStore((state) => state.pendingEmail)
  const lastSentAt = useEmailVerificationStore((state) => state.lastSentAt)
  const retryAfterSeconds = useEmailVerificationStore((state) => state.retryAfterSeconds)
  const hasPendingEmail = useEmailVerificationStore(selectHasPendingEmail)

  const [status, setStatus] = useState<ResendStatus>('idle')
  const [email, setEmail] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const secondsRemaining = cooldownRemaining(now, lastSentAt, retryAfterSeconds)
  const cooling = secondsRemaining > 0

  // Only while there is something to count down. Outside a cooldown nothing on
  // this screen changes with the clock.
  useEffect(() => {
    if (!cooling) return
    const ticker = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(ticker)
  }, [cooling])

  // The address is only shown when it can be masked, so that an unusable or
  // unexpected value is never printed in full.
  const maskedEmail = maskEmail(pendingEmail)
  const destination = hasPendingEmail ? pendingEmail : email.trim()
  const canResend = !cooling && status !== 'sending' && destination !== ''

  const resendLabel = () => {
    if (status === 'sending') return t('auth.verification.resending')
    if (cooling) return t('auth.verification.cooldownButton', { seconds: secondsRemaining })
    return t('auth.verification.resend')
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canResend) return

    const address = destination
    setStatus('sending')

    const res = await resendVerificationEmail(address)
    if (!res) {
      setStatus('failed')
      return
    }

    useEmailVerificationStore.getState().markSent(address, res.retryAfterSeconds)
    // The cooldown starts now, so the countdown must not read from a clock that
    // is up to a tick behind.
    setNow(Date.now())
    setEmail('')
    setStatus('sent')
  }

  return (
    <section className="auth-view">
      <header className="auth-intro">
        <p className="auth-eyebrow">{t('auth.verification.eyebrow')}</p>
        <h1>{t('auth.verification.title')}</h1>
        {maskedEmail ? (
          <p className={styles.destination}>
            {t('auth.verification.sentTo', { email: maskedEmail })}
          </p>
        ) : (
          <p>{t('auth.verification.unknownDestination')}</p>
        )}
      </header>

      <div className={styles.pending}>
        <ClockIcon className={styles.pendingIcon} aria-hidden="true" />
        <div className={styles.pendingBody}>
          <p className={styles.pendingLabel}>{t('auth.verification.pendingLabel')}</p>
          <p>{t('auth.verification.instructions')}</p>
        </div>
      </div>

      <form className="auth-form" method="POST" onSubmit={(event) => void onSubmit(event)}>
        <p className={styles.hint}>{t('auth.verification.notReceived')}</p>

        {!hasPendingEmail && (
          <AppInput
            id="verification-email"
            name="email"
            type="email"
            label={t('auth.email')}
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}

        <AppButton
          type="submit"
          colour="primary"
          size="lg"
          className="mt-2"
          disabled={!canResend}
          aria-busy={status === 'sending'}
        >
          {resendLabel()}
        </AppButton>

        {/* The countdown itself is the button's label, so the live region only
            reports what changed. */}
        <p className={styles.status} role="status" aria-live="polite">
          {status === 'sending' && <span>{t('auth.verification.resending')}</span>}
          {status === 'sent' && <span>{t('auth.verification.resent')}</span>}
        </p>

        {status === 'failed' && (
          <p className={styles.error} role="alert">
            {t('auth.verification.resendFailed')}
          </p>
        )}
      </form>

      <p className="auth-footer">
        {t('auth.verification.differentEmailHelp')}{' '}
        <Link to="/signup" className="auth-link">
          {t('auth.verification.differentEmail')}
        </Link>
      </p>

      <p className="auth-footer">
        <Link to="/login" className="auth-link">
          {t('auth.verification.backToLogin')}
        </Link>
      </p>
    </section>
  )
}
