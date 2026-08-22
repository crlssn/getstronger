import type { ComponentProps } from 'react'

import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppInput } from './AppInput'
import styles from './AppPasswordInput.module.css'

interface Props extends Omit<ComponentProps<typeof AppInput>, 'type' | 'trailing'> {
  value: string
  onValueChange: (value: string) => void
}

/** An AppInput that hides what is typed, with a toggle to show it. */
export const AppPasswordInput = ({ value, onValueChange, ...rest }: Props) => {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <AppInput
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      trailing={
        <button
          type="button"
          className={styles.toggle}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </button>
      }
      {...rest}
    />
  )
}
