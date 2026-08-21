import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'

export default function AppList({
  canFetch,
  children,
  onFetch,
}: {
  canFetch?: boolean
  children: ReactNode
  onFetch?: () => void
}) {
  const sentinelRef = useInfiniteScroll<HTMLLIElement>(
    () => onFetch?.(),
    Boolean(canFetch && onFetch),
  )

  return (
    <ul className="card mb-4 divide-y divide-border overflow-hidden" role="list">
      {children}
      {canFetch && (
        <li ref={sentinelRef} className="flex h-16 items-center justify-center text-text-muted">
          <ArrowPathIcon className="size-7 animate-spin" />
        </li>
      )}
    </ul>
  )
}
