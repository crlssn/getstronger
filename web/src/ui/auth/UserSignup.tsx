import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { brandSignupSubtitle } from '@/brand'
import { signup, verifyEmailPendingPath } from '@/http/requests'
import posthog from '@/posthog'
import { SignupRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { AppButton } from '@/ui/components/AppButton'
import { AppInput } from '@/ui/components/AppInput'
import { AppPasswordInput } from '@/ui/components/AppPasswordInput'
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
        <AppInput
          id="name"
          name="name"
          type="text"
          label={t('auth.name')}
          autoComplete="name"
          required
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />

        <AppInput
          id="username"
          name="username"
          type="text"
          label={t('auth.username')}
          hint={t('auth.usernameHelp')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9._]+"
          required
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
        />

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
          autoComplete="new-password"
          required
          value={password}
          onValueChange={setPassword}
        />

        <AppPasswordInput
          id="passwordConfirmation"
          name="passwordConfirmation"
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          required
          value={passwordConfirmation}
          onValueChange={setPasswordConfirmation}
        />

        <AppButton type="submit" colour="primary" size="lg" className="mt-2">
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
