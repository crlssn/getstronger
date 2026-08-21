import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useId } from 'react'
import type { MouseEvent, ReactNode } from 'react'

// One bottom sheet for every modal surface: drag handle, optional eyebrow,
// title, body copy, a content region for list-style sheets, and stacked
// full-width actions. It sits flush with the bottom edge of the viewport.

const eyebrowToneClasses: Record<'default' | 'success' | 'danger', string> = {
  danger: 'text-danger',
  default: 'text-text-subtle',
  success: 'text-success',
}

export default function AppSheet({
  actions,
  body,
  children,
  closeLabel,
  eyebrow,
  eyebrowTone = 'default',
  onClose,
  title,
}: {
  actions?: ReactNode
  body?: string
  children?: ReactNode
  closeLabel?: string
  eyebrow?: string
  eyebrowTone?: 'default' | 'success' | 'danger'
  onClose: () => void
  title: string
}) {
  const titleId = useId()

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [onClose])

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-strong/40 sm:items-center sm:p-6"
      onClick={onBackdropClick}
    >
      <section
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-sheet bg-white px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-left shadow-overlay sm:max-h-[75vh] sm:rounded-sheet sm:pb-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span
          className="mx-auto mb-4 block h-1 w-12 shrink-0 rounded-full bg-ink-tint sm:hidden"
          aria-hidden="true"
        />
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className={`text-eyebrow font-bold uppercase ${eyebrowToneClasses[eyebrowTone]}`}>
                {eyebrow}
              </p>
            )}
            <h2 id={titleId} className="mt-1 text-title font-semibold text-text">
              {title}
            </h2>
          </div>
          {closeLabel && (
            <button
              type="button"
              aria-label={closeLabel}
              className="grid size-11 shrink-0 place-items-center rounded-control border border-border text-text-subtle [&>svg]:size-5"
              onClick={onClose}
            >
              <XMarkIcon />
            </button>
          )}
        </header>
        {body && <p className="mt-2 text-sm leading-6 text-text-muted">{body}</p>}
        {children && <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>}
        {actions && <div className="mt-4 grid gap-2">{actions}</div>}
      </section>
    </div>
  )
}
