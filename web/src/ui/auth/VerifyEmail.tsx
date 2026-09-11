import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { verifyEmail } from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSkeleton } from '@/ui/components/AppSkeleton'

/**
 * The screen the link in a verification email lands on.
 *
 * It waits on the answer before giving one: the failure copy used to be the
 * first paint, so a working link read as dead for the length of the round trip
 * — on the last step of signing up.
 */
export const VerifyEmail = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // A verification token is single-use, so an effect that runs twice spends it
  // once. Only a retry lowers the latch, and only after an attempt failed.
  const verifying = useRef(false)

  useEffect(() => {
    if (verifying.current) return
    verifying.current = true

    const verify = async () => {
      const res = await verifyEmail(token)
      if (!res) {
        setFailed(true)
        return
      }

      // Nothing is pending any more, so the recovery page no longer has an
      // address to offer.
      useEmailVerificationStore.getState().clear()
      useToastStore.getState().success(t('auth.verification.verified'))
      void navigate('/login')
    }

    void verify()
  }, [attempt, token, t, navigate])

  // The token is unspent whenever the request itself failed, so the same link
  // is still the one to try. A new attempt is what the effect waits on.
  const retry = () => {
    setFailed(false)
    verifying.current = false
    setAttempt((previous) => previous + 1)
  }

  if (!failed) {
    return (
      <section className="auth-view">
        <AppSkeleton lines={2} />
      </section>
    )
  }

  return (
    <section className="auth-view">
      <AppErrorState
        title={t('auth.verification.failedTitle')}
        body={t('auth.verification.failedBody')}
        onRetry={retry}
      />

      <p className="auth-footer">
        <Link to="/verify-email/pending" className="auth-link">
          {t('auth.verification.resend')}
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
