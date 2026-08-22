import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { resetPassword } from '@/http/requests'
import posthog from '@/posthog'
import { ResetPasswordRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'

export const ForgotPassword = () => {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const res = await resetPassword(create(ResetPasswordRequestSchema, { email }))
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
        <div>
          <label htmlFor="email" className="auth-label">
            {t('auth.email')}
          </label>
          <div className="mt-2">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="auth-input"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <AppButton type="submit" colour="primary" className="auth-submit">
          {t('auth.sendResetLink')}
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
