import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { verifyEmail } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import { useEmailVerificationStore } from '@/stores/emailVerification'

/**
 * The screen the link in a verification email lands on.
 *
 * It shows the failure copy and replaces it with a redirect on success, so a
 * dead or reused link explains itself rather than showing nothing.
 */
export const VerifyEmail = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  // A verification token is single-use, so it is spent once.
  const verifying = useRef(false)

  useEffect(() => {
    if (verifying.current) return
    verifying.current = true

    const verify = async () => {
      const res = await verifyEmail(token)
      if (!res) return

      // Nothing is pending any more, so the recovery page no longer has an
      // address to offer.
      useEmailVerificationStore.getState().clear()
      useAlertStore.getState().setSuccess(t('auth.verification.verified'))
      void navigate('/login')
    }

    void verify()
  }, [token, t, navigate])

  return (
    <p className="text-pretty text-lg font-medium text-text-subtle">
      {t('auth.verification.failed')}
    </p>
  )
}
