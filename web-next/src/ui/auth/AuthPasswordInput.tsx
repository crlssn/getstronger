import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import styles from './AuthPasswordInput.module.css'

interface Props {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
}

/** A password field with a reveal toggle, for the auth screens. */
export const AuthPasswordInput = ({
  id,
  name,
  value,
  onChange,
  autoComplete = 'current-password',
}: Props) => {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <div className={styles.passwordInput}>
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        className="auth-input pr-12"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className={styles.passwordToggle}
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </button>
    </div>
  )
}
