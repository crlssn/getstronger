import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { consumeRequestError, resetPassword } from '@/http/requests'
import posthog from '@/posthog'
import { ResetPasswordRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppInput } from '@/ui/components/AppInput'

import styles from './auth.module.css'

export const ForgotPassword = () => {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(undefined)
    let res
    try {
      res = await resetPassword(create(ResetPasswordRequestSchema, { email }))
    } finally {
      setSubmitting(false)
    }
    if (!res) {
      setError(consumeRequestError() ?? t('common.somethingWentWrong'))
      return
    }

    posthog.capture('password_reset_requested')
    setEmail('')
    useToastStore.getState().success(t('auth.recovery.linkSent'))
  }

  return (
    <section className={styles.view}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{t('auth.recovery.eyebrow')}</p>
        <h1>{t('auth.recovery.title')}</h1>
        <p>{t('auth.recovery.intro')}</p>
      </header>

      <form className={styles.form} method="POST" onSubmit={(event) => void onSubmit(event)}>
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

        {error && <AppInlineError>{error}</AppInlineError>}

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

      <p className={styles.footer}>
        {t('auth.recovery.rememberPassword')}{' '}
        <Link to="/login" className={styles.link}>
          {t('auth.login')}
        </Link>
      </p>
    </section>
  )
}
