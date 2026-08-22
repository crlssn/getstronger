import type { ComponentProps } from 'react'

import { useId } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppInput.module.css'

interface Props extends Omit<ComponentProps<'input'>, 'className'> {
  /** The field's visible label. Without one, pass `aria-label` instead. */
  label?: string
  /** A line under the label explaining what the field wants. */
  hint?: string
  invalid?: boolean
  /** Positions the field. The input's own styling is never replaced. */
  className?: string
}

/**
 * The app's text field: label, hint and input in the one arrangement.
 *
 * Screens used to assemble those three by hand, which is how the app ended up
 * with four field heights and three focus treatments.
 */
export const AppInput = ({ label, hint, invalid, className, id, ...rest }: Props) => {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className={cn(styles.field, className)}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      {hint && <p className={styles.hint}>{hint}</p>}
      <input
        id={inputId}
        className={cn(styles.input, invalid && styles.invalid)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  )
}
