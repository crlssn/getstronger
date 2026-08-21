import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { brandSignupSubtitle } from '@/brand'
import { signup, verifyEmailPendingPath } from '@/http/requests'
import posthog from '@/posthog'
import { SignupRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { AuthPasswordInput } from '@/ui/auth/AuthPasswordInput'
import { AppButton } from '@/ui/components/AppButton'
import { usernameFromName } from '@/utils/names'

export const UserSignup = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [usernameEdited, setUsernameEdited] = useState(false)

  // The username follows the name until it is typed in, which is the only
  // signal that the suggestion is not wanted. Clearing the field hands it back.
  const onNameChange = (value: string) => {
    setName(value)
    if (!usernameEdited) setUsername(usernameFromName(value))
  }

  const onUsernameChange = (value: string) => {
    // Usernames are case-insensitive to the backend, so folding here stops the
    // account reading differently from how it is addressed.
    const typed = value.toLowerCase()
    setUsername(typed)
    setUsernameEdited(typed !== '')
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const res = await signup(
      create(SignupRequestSchema, { name, username, email, password, passwordConfirmation }),
    )
    if (!res) return

    posthog.capture('account_signed_up')
    // Signup sends the first verification email, so the resend cooldown starts
    // here rather than on the pending page.
    useEmailVerificationStore.getState().markSent(email)
    void navigate(verifyEmailPendingPath)
  }

  return (
    <section className="auth-view">
      <header className="auth-intro">
        <p className="auth-eyebrow">{t('auth.startTraining')}</p>
        <h1>{t('auth.signupTitle')}</h1>
        <p>{brandSignupSubtitle}</p>
      </header>

      <form className="auth-form" method="POST" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <label htmlFor="name" className="auth-label">
            {t('auth.name')}
          </label>
          <div className="mt-2">
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className="auth-input"
              required
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="username" className="auth-label">
            {t('auth.username')}
          </label>
          <p className="mt-1 text-sm text-text-subtle">{t('auth.usernameHelp')}</p>
          <div className="mt-2">
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="auth-input"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9._]+"
              required
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
            />
          </div>
        </div>

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
          <label htmlFor="password" className="auth-label">
            {t('auth.password')}
          </label>
          <div className="mt-2">
            <AuthPasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            />
          </div>
        </div>

        <div>
          <label htmlFor="passwordConfirmation" className="auth-label">
            {t('auth.confirmPassword')}
          </label>
          <div className="mt-2">
            <AuthPasswordInput
              id="passwordConfirmation"
              name="passwordConfirmation"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={setPasswordConfirmation}
            />
          </div>
        </div>

        <AppButton type="submit" colour="primary" className="auth-submit">
          {t('auth.createAccount')}
        </AppButton>
      </form>

      <p className="auth-footer">
        {t('auth.alreadyMember')}{' '}
        <Link to="/login" className="auth-link">
          {t('auth.login')}
        </Link>
      </p>
    </section>
  )
}
