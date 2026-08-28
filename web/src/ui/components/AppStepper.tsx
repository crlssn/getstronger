import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline'

import { cn } from '@/ui/cn'
import { AppIconButton } from '@/ui/components/AppIconButton'
import styles from './AppStepper.module.css'

interface Props {
  value: number
  onChange: (value: number) => void
  /** The control's accessible name. */
  label: string
  /** How the value reads, on the screen and to a screen reader. */
  format: (value: number) => string
  /** The buttons' accessible names, which name the field they adjust. */
  decreaseLabel: string
  increaseLabel: string
  /** How far one nudge moves the value. */
  step?: number
  min?: number
  max?: number
  className?: string
}

/**
 * A number nudged in steps, read rather than typed.
 *
 * The value is shown between a thumb on either side: a field in the middle
 * asked every screen holding one to carry a border, a focus ring and a
 * keyboard, and stepping is the edit people actually make.
 *
 * It is a `spinbutton` rather than three unrelated controls, so the value is
 * announced as it changes and the arrow keys move it — the one thing typing
 * gave a keyboard that the buttons alone would not.
 */
export const AppStepper = ({
  value,
  onChange,
  label,
  format,
  decreaseLabel,
  increaseLabel,
  step = 1,
  min = 0,
  max = 100,
  className,
}: Props) => {
  const clamp = (next: number) => Math.min(Math.max(Math.round(next), min), max)
  const nudge = (by: number) => onChange(clamp(value + by))

  return (
    <div className={cn(styles.stepper, className)}>
      <AppIconButton
        className={styles.nudge}
        icon={MinusIcon}
        label={decreaseLabel}
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
        aria-valuetext={format(value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') nudge(step)
          else if (event.key === 'ArrowDown') nudge(-step)
          else return
          event.preventDefault()
        }}
      >
        {format(value)}
      </span>
      <AppIconButton
        className={styles.nudge}
        icon={PlusIcon}
        label={increaseLabel}
        disabled={value >= max}
        onClick={() => nudge(step)}
      />
    </div>
  )
}
