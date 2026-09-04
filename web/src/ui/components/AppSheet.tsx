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
  const backdrop = useRef<HTMLDivElement>(null)

  // Callers close a sheet by unmounting it, so the slide-down cannot play
  // inside React: by the time this cleanup runs, the backdrop is already out
  // of the document. It stages the exit itself — puts the detached element
  // back, inert and hidden from assistive tech, and removes it for good when
  // its fade ends. React is finished with the element by then, and under
  // StrictMode's rehearsal the element is still connected, so nothing stages.
  useEffect(() => {
    const el = backdrop.current
    return () => {
      if (!el || el.isConnected) return
      // A reader who asked for less movement gets none; the stylesheet also
      // stills the keyframes.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

      el.classList.add(styles.closing)
      el.setAttribute('aria-hidden', 'true')
      el.setAttribute('inert', '')
      document.body.append(el)

      const remove = () => el.remove()
      // Asked, not sniffed: an element animates only once it is back in the
      // document, and nothing plays under jsdom or a stylesheet that failed to
      // load. Sniffing for the method instead left the copy waiting on the
      // fallback timer as soon as anything in the bundle polyfilled it —
      // @headlessui/react does, so importing a dropdown put a dismissed sheet
      // back on screen for 400ms.
      if (!el.getAnimations?.().length) {
        remove()
        return
      }
      // Nothing here outlives the exit: the listener and timer hold the only
      // references to an element no longer React's, and `remove()` ends both.
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener
      el.addEventListener('animationend', (event) => {
        if (event.target === el) remove()
      })
      // In case the fade never ends — a stylesheet that failed to load, an
      // animation cancelled mid-flight.
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
      setTimeout(remove, 400)
    }
  }, [])

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
    // The keyboard path off this dialog is Escape, handled above. A backdrop
    // that took focus of its own would put a tab stop in front of the panel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={backdrop}
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
