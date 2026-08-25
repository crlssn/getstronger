import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppDurationInput } from '@/ui/components/AppDurationInput'
import { AppIconButton } from '@/ui/components/AppIconButton'
import styles from './AppDurationStepper.module.css'

interface Props {
  value: number
  onChange: (seconds: number) => void
  /** The field's accessible name; the two buttons take theirs from it. */
  label: string
  id?: string
  /** How far one nudge moves the duration. */
  step?: number
  min?: number
  max?: number
  className?: string
}

/**
 * A duration set either by typing it or by nudging it in coarse steps.
 *
 * A rest is read off a clock rather than counted in seconds, so the value shows
 * as `m:ss`; the two buttons are there because adjusting one by half a minute
 * is the common edit, and selecting a field to retype it is a poor way to make
 * it. Typing still wins where the wanted length is not a multiple of the step.
 *
 * The three parts are drawn as one control — the value is what the buttons
 * change, not a field they happen to sit beside — so the border, the rounding
 * and the focus ring belong to the whole rather than to each piece.
 *
 * The value is always a number: an empty field is a half-typed state rather
 * than an answer, so clearing it leaves the last value alone and the field
 * snaps back to it on the way out. Zero is typed, or stepped down to.
 */
export const AppDurationStepper = ({
  value,
  onChange,
  label,
  id,
  step = 30,
  min = 0,
  max = 3600,
  className,
}: Props) => {
  const { t } = useTranslation()

  const clamp = (seconds: number) => Math.min(Math.max(Math.round(seconds), min), max)
  const nudge = (by: number) => onChange(clamp(value + by))

  return (
    <div className={cn(styles.stepper, className)}>
      <AppIconButton
        className={styles.nudge}
        icon={MinusIcon}
        label={t('common.durationDecrease', { label, seconds: step })}
        disabled={value <= min}
        onClick={() => nudge(-step)}
      />
      <AppDurationInput
        id={id}
        className={styles.field}
        aria-label={label}
        value={value}
        // An empty field is nobody's answer, so the last value stands until the
        // next readable one arrives.
        onChange={(seconds) => seconds !== undefined && onChange(clamp(seconds))}
      />
      <AppIconButton
        className={styles.nudge}
        icon={PlusIcon}
        label={t('common.durationIncrease', { label, seconds: step })}
        disabled={value >= max}
        onClick={() => nudge(step)}
      />
    </div>
  )
}
