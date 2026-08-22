import type { ChangeEvent, ComponentProps } from 'react'

import { autosize } from '@/utils/autosize'
import { cn } from '@/ui/cn'
import styles from './AppTextarea.module.css'

interface Props extends Omit<ComponentProps<'textarea'>, 'className'> {
  placeholder: string
  rows: number
  /** Grows with its content instead of scrolling. */
  autosize?: boolean
  className?: string
}

/** The multi-line field, matching AppInput's border and focus treatment. */
export const AppTextarea = ({
  className,
  autosize: grows = false,
  onChange,
  ref,
  ...rest
}: Props) => (
  <textarea
    ref={(element) => {
      if (grows) autosize(element)
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    }}
    className={cn(styles.textarea, grows && styles.grows, className)}
    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
      if (grows) autosize(event.target)
      onChange?.(event)
    }}
    {...rest}
  />
)
