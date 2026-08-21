import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

// Six dashed-border variants at three padding values and two backgrounds said
// the same thing six ways, and only one of them offered a way out.
//
// This is the one place in the design foundation where a component earns its
// keep over a CSS class, because the rule being enforced is editorial: always
// offer a next step. `action` is required — not required to exist, required to
// be decided. A screen with genuinely nowhere to go has to write action="none"
// in its own markup, where a reviewer will see the choice being made. A class
// cannot make anyone choose.
type Action = { label: string; to?: string }

export default function AppEmptyState({
  action,
  actionIcon,
  body,
  icon,
  onAction,
  title,
}: {
  action: Action | 'none'
  actionIcon?: ReactNode
  body?: string
  icon?: ReactNode
  onAction?: () => void
  title: string
}) {
  return (
    <div className="card grid justify-items-start gap-3 p-6">
      {icon && (
        <span className="grid size-11 place-items-center rounded-control bg-ink-tint text-text-muted [&_svg]:size-5">
          {icon}
        </span>
      )}
      <h2 className="text-body-lg font-semibold text-text">{title}</h2>
      {body && <p className="text-sm leading-6 text-text-muted">{body}</p>}
      {action !== 'none' && action.to && (
        <Link
          to={action.to}
          className="mt-1 inline-flex min-h-(--size-control-sm) items-center gap-2 rounded-control bg-ink px-4 text-sm font-semibold text-white transition hover:brightness-125 [&_svg]:size-5"
        >
          {actionIcon}
          {action.label}
        </Link>
      )}
      {action !== 'none' && !action.to && (
        <button
          type="button"
          className="mt-1 inline-flex min-h-(--size-control-sm) items-center gap-2 rounded-control bg-ink px-4 text-sm font-semibold text-white transition hover:brightness-125 [&_svg]:size-5"
          onClick={onAction}
        >
          {actionIcon}
          {action.label}
        </button>
      )}
    </div>
  )
}
