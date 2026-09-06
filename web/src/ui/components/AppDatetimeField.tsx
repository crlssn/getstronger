import { DateTime } from 'luxon'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { dateLocale } from '@/i18n'
import { cn } from '@/ui/cn'
import styles from './AppDatetimeField.module.css'

interface Props {
  /** The field's accessible name — the native input has no visible label. */
  label: string
  /** The committed value, in datetime-local form ("2026-08-28T20:42"). */
  model: string
  required?: boolean
  className?: string
  onUpdate: (value: string) => void
}

/**
 * A moment in the app's own date form, with an Edit affordance.
 *
 * The browser's own datetime-local row set a raw "2026-08-28T20:42" in a
 * different costume per platform. The native input is still here — stretched
 * invisibly over the field so a tap opens the platform's own picker and a
 * screen reader still meets a real control — but what a sighted reader sees is
 * the app's date form.
 */
export const AppDatetimeField = ({ label, model, required, className, onUpdate }: Props) => {
  const { t } = useTranslation()
  const [value, setValue] = useState(model)
  const [committed, setCommitted] = useState(model)

  // A value the caller changes underneath — a form reset, or a fetch landing —
  // replaces what is in the field. Adjusted during render rather than in an
  // effect, which would paint the stale value first.
  if (model !== committed) {
    setCommitted(model)
    setValue(model)
  }

  const moment = DateTime.fromISO(value)

  return (
    <div className={cn(styles.field, className)}>
      <span aria-hidden="true">
        {moment.isValid ? moment.setLocale(dateLocale()).toFormat('ccc d LLL · HH:mm') : ''}
      </span>
      <span className={styles.edit} aria-hidden="true">
        {t('common.edit')}
      </span>
      <input
        aria-label={label}
        className={styles.input}
        required={required}
        type="datetime-local"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onUpdate(value)}
      />
    </div>
  )
}
