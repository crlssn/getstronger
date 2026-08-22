import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { updatePassword } from '@/http/requests'
import posthog from '@/posthog'
import { UpdatePasswordRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppPasswordInput } from '@/ui/components/AppPasswordInput'

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
    useToastStore.getState().success(t('auth.recovery.resetDone'))
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
        <AppPasswordInput
          id="password"
          name="password"
          label={t('auth.recovery.newPassword')}
          autoComplete="new-password"
          required
          value={password}
          onValueChange={setPassword}
        />

        <AppPasswordInput
          id="passwordConfirmation"
          name="passwordConfirmation"
          label={t('auth.recovery.confirmNewPassword')}
          autoComplete="new-password"
          required
          value={passwordConfirmation}
          onValueChange={setPasswordConfirmation}
        />

        <AppButton type="submit" colour="primary" size="lg" className="mt-2">
          {t('auth.recovery.updatePassword')}
        </AppButton>
      </form>
    </section>
  )
}
