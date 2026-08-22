import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { brandName } from '@/brand'
import { login } from '@/http/requests'
import posthog from '@/posthog'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { AppButton } from '@/ui/components/AppButton'
import { AppInput } from '@/ui/components/AppInput'
import { AppPasswordInput } from '@/ui/components/AppPasswordInput'

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

        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-text">{t('auth.password')}</span>
            <AppButton type="link" colour="ghost" size="sm" width="auto" to="/forgot-password">
              {t('auth.forgotPassword')}
            </AppButton>
          </div>
          <AppPasswordInput
            id="password"
            name="password"
            aria-label={t('auth.password')}
            required
            value={password}
            onValueChange={setPassword}
          />
        </div>

        <AppButton type="submit" colour="primary" size="lg" className="mt-2">
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
