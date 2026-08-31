import type { ComponentProps, ReactNode } from 'react'

import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useId, useRef } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppSheet.module.css'

type SheetActionTone = 'primary' | 'danger' | 'dangerOutline' | 'tertiary'

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
  /* Two tones, because a sheet has two things to say about itself: this is
     ordinary, or this destroys something. Green belongs to what is happening
     right now, which a sheet never is. */
  eyebrowTone?: 'default' | 'danger'
  body?: string
  closeLabel?: string
  onClose: () => void
  children?: ReactNode
  actions?: ReactNode
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
  const panel = useRef<HTMLElement>(null)

  // `aria-modal` hides the page behind the sheet from a screen reader, so the
  // sheet has to hold the keyboard too: focus starts on the panel, Tab cannot
  // leave it, and whatever opened the sheet gets focus back. Callers used to
  // blur the trigger instead, which dropped focus to the body — from where Tab
  // walks the hidden page before ever reaching the sheet.
  useEffect(() => {
    const opener = document.activeElement
    panel.current?.focus({ preventScroll: true })

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      const stops = Array.from(panel.current.querySelectorAll<HTMLElement>(focusableSelector))
      const first = stops[0]
      const last = stops[stops.length - 1]
      const active = document.activeElement

      // A sheet that is only a question has nowhere for Tab to go, and letting
      // it out would land on the page the dialog has hidden.
      if (!first || !last) {
        event.preventDefault()
        panel.current.focus({ preventScroll: true })
        return
      }

      // Tabbing forward off the panel itself needs no help — the browser
      // already moves into the first stop inside it.
      const outside = !panel.current.contains(active)
      const wrapsBackward = outside || active === first || active === panel.current
      const wrapsForward = outside || active === last

      if (event.shiftKey && wrapsBackward) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && wrapsForward) {
        event.preventDefault()
        first.focus()
      }
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
        ref={panel}
        className={styles.sheetPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Focusable only as the sheet's landing point, never as a tab stop.
        tabIndex={-1}
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
