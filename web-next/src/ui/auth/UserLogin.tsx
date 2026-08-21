import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { brandName } from '@/brand'
import { login } from '@/http/requests'
import posthog from '@/posthog'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { AuthPasswordInput } from '@/ui/auth/AuthPasswordInput'
import { AppButton } from '@/ui/components/AppButton'

export const UserLogin = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const res = await login(email, password)
    if (!res) return

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

        <div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="password" className="auth-label">
              {t('auth.password')}
            </label>
            <Link to="/forgot-password" className="auth-link text-sm">
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <div className="mt-2">
            <AuthPasswordInput
              id="password"
              name="password"
              value={password}
              onChange={setPassword}
            />
          </div>
        </div>

        <AppButton type="submit" colour="primary" className="auth-submit">
          {t('auth.login')}
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
