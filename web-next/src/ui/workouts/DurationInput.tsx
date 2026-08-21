import type { ComponentProps } from 'react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'
import { parseDuration } from '@/utils/parseDuration'

interface Props extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value: number | undefined
  onChange: (seconds: number | undefined) => void
}

const display = (seconds: number | undefined) =>
  seconds === undefined ? '' : formatMeasurementDuration(seconds)

/**
 * A duration field that reads "1:30" and "130" alike.
 *
 * The text is state of its own rather than derived from the value: deriving it
 * would reformat the field on every keystroke and rewrite what is being typed.
 * The value follows the text; the text only snaps to the canonical format when
 * the field is left.
 */
export const DurationInput = ({ value, onChange, ...rest }: Props) => {
  const { t } = useTranslation()

  const [text, setText] = useState(() => display(value))
  const [focused, setFocused] = useState(false)

  // An external write — restoring a draft, or copying the previous session's
  // value on focus — has to reach the display, but must never rewrite text
  // mid-typing. Adjusted during render rather than in an effect: an effect
  // would paint the stale text first.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (!focused || !text.trim()) setText(display(value))
  }

  return (
    <input
      {...rest}
      value={text}
      type="text"
      inputMode="numeric"
      placeholder={t('workout.durationPlaceholder')}
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseDuration(event.target.value, value))
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
}
