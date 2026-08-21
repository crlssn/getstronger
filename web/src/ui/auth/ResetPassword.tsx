import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { updatePassword } from '@/http/requests'
import posthog from '@/posthog'
import { UpdatePasswordRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useAlertStore } from '@/stores/alerts'
import { AuthPasswordInput } from '@/ui/auth/AuthPasswordInput'
import { AppButton } from '@/ui/components/AppButton'

export const ResetPassword = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const res = await updatePassword(
      create(UpdatePasswordRequestSchema, {
        password,
        passwordConfirmation,
        token: params.get('token') ?? '',
      }),
    )
    if (!res) return

    posthog.capture('password_reset_completed')
    useAlertStore.getState().setSuccess(t('auth.recovery.resetDone'))
    void navigate('/login')
  }

  return (
    <section className="auth-view">
      <header className="auth-intro">
        <p className="auth-eyebrow">{t('auth.recovery.secureEyebrow')}</p>
        <h1>{t('auth.recovery.chooseTitle')}</h1>
        <p>{t('auth.recovery.chooseIntro')}</p>
      </header>

      <form className="auth-form" method="POST" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <label htmlFor="password" className="auth-label">
            {t('auth.recovery.newPassword')}
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
            {t('auth.recovery.confirmNewPassword')}
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
          {t('auth.recovery.updatePassword')}
        </AppButton>
      </form>
    </section>
  )
}
