import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export default function AppListItemLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between gap-x-6 px-4 py-5 font-medium text-text transition hover:bg-ink-surface hover:text-ink-strong [&>svg]:size-5 [&>svg]:shrink-0"
      >
        {children}
      </Link>
    </li>
  )
}
