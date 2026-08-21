import type { ComponentProps, ReactNode } from 'react'

import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useId } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppSheet.module.css'

export type SheetActionTone = 'primary' | 'danger' | 'dangerOutline' | 'tertiary'

interface ActionProps extends Omit<ComponentProps<'button'>, 'className'> {
  tone: SheetActionTone
  className?: string
}

/**
 * A full-width button in a sheet's action stack.
 *
 * The tone is the ranking rather than a colour, and it is a prop rather than a
 * class so a caller cannot invent a fifth one.
 */
export const SheetAction = ({ tone, className, children, ...rest }: ActionProps) => (
  <button type="button" className={cn(styles.action, styles[tone], className)} {...rest}>
    {children}
  </button>
)

interface Props {
  title: string
  eyebrow?: string
  eyebrowTone?: 'default' | 'success' | 'danger'
  body?: string
  closeLabel?: string
  onClose: () => void
  children?: ReactNode
  actions?: ReactNode
}

// One bottom sheet for every modal surface: drag handle, optional eyebrow,
// title, body copy, a content region for list-style sheets, and stacked
// full-width actions. It sits flush with the bottom edge of the viewport.
export const AppSheet = ({
  title,
  eyebrow,
  eyebrowTone = 'default',
  body,
  closeLabel,
  onClose,
  children,
  actions,
}: Props) => {
  const titleId = useId()

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [onClose])

  return (
    <div
      className={styles.sheetBackdrop}
      onClick={(event) => {
        // Only the backdrop itself dismisses; a click inside the panel bubbles
        // out through it.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={styles.sheetPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span className={styles.sheetHandle} aria-hidden="true" />

        <header className={styles.sheetHeader}>
          <div className="min-w-0">
            {eyebrow && <p className={cn(styles.sheetEyebrow, styles[eyebrowTone])}>{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          {closeLabel && (
            <button
              type="button"
              className={styles.sheetClose}
              aria-label={closeLabel}
              onClick={onClose}
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          )}
        </header>

        {body && <p className={styles.sheetBody}>{body}</p>}
        {children && <div className={styles.sheetContent}>{children}</div>}
        {actions && <div className={styles.sheetActions}>{actions}</div>}
      </section>
    </div>
  )
}
