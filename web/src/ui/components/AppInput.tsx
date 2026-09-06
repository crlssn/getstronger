import type { ComponentProps, ReactNode } from 'react'

import { useId } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppInput.module.css'

interface Props extends Omit<ComponentProps<'input'>, 'className'> {
  /** The field's visible label. Without one, pass `aria-label` instead. */
  label?: string
  /** A control on the label's own line, like a password field's "Forgot it?". */
  labelAction?: ReactNode
  /** A line under the label explaining what the field wants. */
  hint?: string
  invalid?: boolean
  /** A control at the trailing edge, inside the field's border. */
  trailing?: ReactNode
  /**
   * `hero` is for the one field a screen is built around.
   *
   * The label rises to the caps overline register on the page background, and
   * the input stands on the canvas rather than inside a panel.
   */
  variant?: 'default' | 'hero'
  /** Positions the field. The input's own styling is never replaced. */
  className?: string
}

/**
 * The app's text field: label, hint and input in the one arrangement.
 *
 * Screens used to assemble those three by hand, which is how the app ended up
 * with four field heights and three focus treatments.
 */
export const AppInput = ({
  label,
  labelAction,
  hint,
  invalid,
  trailing,
  variant = 'default',
  className,
  id,
  ...rest
}: Props) => {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className={cn(styles.field, variant === 'hero' && styles.hero, className)}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
          {labelAction}
        </div>
      )}
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.control}>
        <input
          id={inputId}
          className={cn(
            styles.input,
            Boolean(trailing) && styles.hasTrailing,
            invalid && styles.invalid,
          )}
          aria-invalid={invalid || undefined}
          {...rest}
        />
        {trailing}
      </div>
    </div>
  )
}
