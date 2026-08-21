import type { ComponentProps } from 'react'

import { useState } from 'react'

import { titleCase } from '@/utils/names'
import styles from './AppListItemInput.module.css'

interface Props extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  /** The committed value. Local edits are kept until the field is left. */
  model: string
  type: string
  capitalise?: boolean
  onUpdate: (value: string) => void
}

/**
 * A text field that fills a list row.
 *
 * The value is committed when the field is left rather than on every
 * keystroke, so a half-typed name never reaches the caller.
 */
export const AppListItemInput = ({ model, type, capitalise = false, onUpdate, ...rest }: Props) => {
  const [value, setValue] = useState(model)
  const [committed, setCommitted] = useState(model)

  // A value the caller changes underneath — a form reset, or a fetch landing —
  // replaces what is in the field. Adjusted during render rather than in an
  // effect: an effect would paint the stale value first, and React re-runs this
  // render before touching the DOM.
  if (model !== committed) {
    setCommitted(model)
    setValue(model)
  }

  return (
    <li>
      <input
        className={styles.input}
        type={type}
        value={value}
        onChange={(event) =>
          setValue(capitalise ? titleCase(event.target.value) : event.target.value)
        }
        onBlur={() => onUpdate(value)}
        {...rest}
      />
    </li>
  )
}
