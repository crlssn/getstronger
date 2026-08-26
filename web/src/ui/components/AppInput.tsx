import type { ComponentProps, ReactNode } from 'react'

import { useId } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppInput.module.css'

interface Props extends Omit<ComponentProps<'input'>, 'className'> {
  /** The field's visible label. Without one, pass `aria-label` instead. */
  label?: string
  /** A line under the label explaining what the field wants. */
  hint?: string
  invalid?: boolean
  /** A control at the trailing edge, inside the field's border. */
  trailing?: ReactNode
  /**
   * `card` draws the field as the panel it fills: the label sits inside it as
   * an eyebrow and the value is read at title size. For the one field a screen
   * is built around, rather than one of a form's many.
   */
  variant?: 'default' | 'card'
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
    <div className={cn(styles.field, variant === 'card' && styles.card, className)}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
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
