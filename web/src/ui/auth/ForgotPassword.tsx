import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { resetPassword } from '@/http/requests'
import posthog from '@/posthog'
import { ResetPasswordRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppInput } from '@/ui/components/AppInput'

export const ForgotPassword = () => {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    let res
    try {
      res = await resetPassword(create(ResetPasswordRequestSchema, { email }))
    } finally {
      setSubmitting(false)
    }
    if (!res) return

    posthog.capture('password_reset_requested')
    setEmail('')
    useToastStore.getState().success(t('auth.recovery.linkSent'))
  }

  return (
    <section className="auth-view">
      <header className="auth-intro">
        <p className="auth-eyebrow">{t('auth.recovery.eyebrow')}</p>
        <h1>{t('auth.recovery.title')}</h1>
        <p>{t('auth.recovery.intro')}</p>
      </header>

      <form className="auth-form" method="POST" onSubmit={(event) => void onSubmit(event)}>
        <AppInput
          id="email"
          name="email"
          type="email"
          label={t('auth.email')}
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <AppButton
          type="submit"
          colour="primary"
          size="lg"
          className="mt-2"
          disabled={submitting}
          aria-busy={submitting || undefined}
        >
          {submitting ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
        </AppButton>
      </form>

      <p className="auth-footer">
        {t('auth.recovery.rememberPassword')}{' '}
        <Link to="/login" className="auth-link">
          {t('auth.login')}
        </Link>
      </p>
    </section>
  )
}
