import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { brandName } from '@/brand'
import { consumeRequestError, login } from '@/http/requests'
import posthog from '@/posthog'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { AppButton } from '@/ui/components/AppButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppInput } from '@/ui/components/AppInput'
import { AppPasswordInput } from '@/ui/components/AppPasswordInput'

export const UserLogin = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // A submit against an unreachable server used to do nothing visible at all.
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(undefined)
    let res
    try {
      res = await login(email, password)
    } finally {
      setSubmitting(false)
    }
    if (!res) {
      setError(consumeRequestError() ?? t('common.somethingWentWrong'))
      return
    }

    useAuthStore.getState().setAccessToken(res.accessToken)
    posthog.capture('user_logged_in')
    useNotificationStore.getState().pollUnreadNotifications()
    void navigate('/home')
  }

  return (
    <section className="auth-view">
      <header className="auth-intro">
        <p className="auth-eyebrow">{t('auth.welcomeBack')}</p>
        <h1>{t('auth.loginTitle', { brand: brandName })}</h1>
        <p>{t('auth.loginSubtitle')}</p>
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

        <AppPasswordInput
          id="password"
          name="password"
          label={t('auth.password')}
          labelAction={
            <AppButton type="link" colour="ghost" size="sm" width="auto" to="/forgot-password">
              {t('auth.forgotPassword')}
            </AppButton>
          }
          required
          value={password}
          onValueChange={setPassword}
        />

        {error && <AppInlineError>{error}</AppInlineError>}

        <AppButton
          type="submit"
          colour="primary"
          size="lg"
          className="mt-2"
          disabled={submitting}
          aria-busy={submitting || undefined}
        >
          {submitting ? t('auth.loggingIn') : t('auth.login')}
        </AppButton>
      </form>

      <p className="auth-footer">
        {t('auth.newMember', { brand: brandName })}{' '}
        <Link to="/signup" className="auth-link">
          {t('auth.createAccount')}
        </Link>
      </p>
    </section>
  )
}
