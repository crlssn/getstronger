import type { ComponentProps, ReactNode, Ref } from 'react'

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

import { cn } from '@/ui/cn'
import styles from './AppSearchField.module.css'

// `size` shadows the HTML attribute of the same name, which is a character
// count nothing here wants.
interface Props extends Omit<
  ComponentProps<'input'>,
  'className' | 'onChange' | 'value' | 'type' | 'size'
> {
  /** Names the field once: it is both the placeholder and the label. */
  label: string
  value: string
  onChange: (value: string) => void
  /** `lg` for the home search panel, where the field is the whole screen. */
  size?: 'md' | 'lg'
  /** A control at the trailing edge, inside the field's border. */
  trailing?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/**
 * The one way the app asks the user to search.
 *
 * Five screens used to build this out of a magnifier, a `type="search"` input
 * and a label, at three heights and two icon sizes.
 */
export const AppSearchField = ({
  label,
  value,
  onChange,
  size = 'md',
  trailing,
  inputRef,
  className,
  ...rest
}: Props) => (
  <label className={cn(styles.field, styles[size], className)}>
    <MagnifyingGlassIcon className={styles.icon} aria-hidden="true" />
    <input
      ref={inputRef}
      type="search"
      className={cn(styles.input, styles[size])}
      placeholder={label}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...rest}
    />
    {trailing}
  </label>
)
