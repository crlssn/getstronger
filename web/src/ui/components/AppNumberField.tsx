import type { ComponentProps } from 'react'

import { useState } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppNumberField.module.css'

const parseEntry = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

interface Props
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'className'> {
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** A unit shown inside the field, as a label on it rather than a control. */
  unit?: string
  className?: string
}

/**
 * A number field that keeps the text being typed rather than the number read
 * from it.
 *
 * Rendering `value` straight into the input would swallow the keystroke halfway
 * through "3.5", because "3." parses to 3 and would be written back as "3". An
 * external write — the previous session's value copied in on focus — still
 * reaches the field, since the number changing is what refreshes the text.
 *
 * The two set grids each had a version of this, and only one of them kept the
 * text: typing a decimal into the other lost the point.
 */
export const AppNumberField = ({ value, onChange, unit, className, ...rest }: Props) => {
  const [text, setText] = useState(() => (value === undefined ? '' : String(value)))

  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value === undefined ? '' : String(value))
  }

  const field = (
    <input
      {...rest}
      className={cn(styles.field, unit && styles.withUnit, !unit && className)}
      type="text"
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseEntry(event.target.value))
      }}
    />
  )

  if (!unit) return field

  return (
    <div className={cn(styles.unitEntry, className)}>
      {field}
      <span className={styles.unit}>{unit}</span>
    </div>
  )
}
