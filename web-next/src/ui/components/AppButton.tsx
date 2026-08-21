import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type Colour = 'primary' | 'secondary' | 'ghost' | 'destructive'

// Four roles, not six colours: primary (ink fill), secondary (white with an
// ink border), ghost (text only) and destructive (danger text, never a red
// fill). Anything that wants "a bit of colour" has no name to reach for.
//
// Each colour also owns its border colour, rather than sharing one across
// variants — combining a shared `border-*` utility with a per-colour one on
// the same element leaves Tailwind's internal rule order to pick a winner.
const colourClasses: Record<Colour, string> = {
  destructive: 'border-transparent text-danger hover:bg-danger-surface hover:text-danger-strong',
  ghost: 'border-transparent text-text-muted hover:bg-ink-surface hover:text-text',
  primary: 'border-ink bg-ink text-white hover:bg-ink-strong',
  secondary: 'border-ink-border bg-white text-text hover:bg-ink-surface',
}

const shared = 'w-full rounded-control border px-4 py-3 text-sm font-semibold transition'

export default function AppButton({
  children,
  className,
  colour,
  // Vue's version has no `disabled` prop either, but attrs fall through onto
  // the root element automatically there; React has no such fallthrough, so
  // it is declared explicitly to keep that capability for `type="submit"`
  // buttons disabled while a form is saving.
  disabled,
  to,
  type,
}: {
  children: ReactNode
  className?: string
  colour: Colour
  disabled?: boolean
  to?: string
  type: 'button' | 'link' | 'submit'
}) {
  const classes = `${shared} ${colourClasses[colour]} ${className ?? ''}`

  if (type === 'link') {
    return (
      <Link to={to as string} className={`block text-center ${classes}`}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex min-h-(--size-control) items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${classes}`}
    >
      {children}
    </button>
  )
}
