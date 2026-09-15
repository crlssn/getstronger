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

const display = (value: number | undefined) => (value === undefined ? '' : String(value))

interface Props extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'className'> {
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** A unit shown inside the field, as a label on it rather than a control. */
  unit?: string
  className?: string
}

/**
 * A field that keeps the text being typed, not the number read from it.
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
  const [text, setText] = useState(() => display(value))
  const [focused, setFocused] = useState(false)

  // The value moves on every keystroke, so while the field is focused the
  // text is left alone: "62.5" backspaced to "62." parses to 62, and writing
  // that back would eat the point. An empty field still takes the write — the
  // session log copies the previous set in during the focus event.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (!focused || !text.trim()) setText(display(value))
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
      onFocus={(event) => {
        setFocused(true)
        rest.onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        setText(display(value))
        rest.onBlur?.(event)
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
