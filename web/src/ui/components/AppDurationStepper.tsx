import { useTranslation } from 'react-i18next'

import { AppStepper } from '@/ui/components/AppStepper'
import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'

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
 * The stepper underneath knows nothing about time; this is where a rest becomes
 * `m:ss` and the buttons say how many seconds they move.
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

  return (
    <AppStepper
      className={className}
      value={value}
      onChange={onChange}
      label={label}
      format={formatMeasurementDuration}
      decreaseLabel={t('common.durationDecrease', { label, seconds: step })}
      increaseLabel={t('common.durationIncrease', { label, seconds: step })}
      step={step}
      min={min}
      max={max}
    />
  )
}
