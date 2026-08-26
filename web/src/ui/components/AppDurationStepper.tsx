import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'
import styles from './AppDurationStepper.module.css'

interface Props {
  value: number
  onChange: (seconds: number) => void
  /** The control's accessible name; the two buttons build theirs from it. */
  label: string
  /** How far one nudge moves the duration. */
  step?: number
  min?: number
  max?: number
  className?: string
}

/**
 * A duration nudged in coarse steps, read off a clock.
 *
 * The value is shown rather than typed: a rest is chosen in half-minutes, and a
 * field in the middle of the control asked every screen holding one to carry a
 * border, a focus ring and a keyboard. What is left is a value with a thumb on
 * either side of it, which is the edit people actually make.
 *
 * It is a `spinbutton` rather than three unrelated controls, so the value is
 * announced as it changes and the arrow keys move it — the one thing typing
 * gave a keyboard that the buttons alone would not.
 */
export const AppDurationStepper = ({
  value,
  onChange,
  label,
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
      <span
        className={styles.value}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatMeasurementDuration(value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') nudge(step)
          else if (event.key === 'ArrowDown') nudge(-step)
          else return
          event.preventDefault()
        }}
      >
        {formatMeasurementDuration(value)}
      </span>
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
