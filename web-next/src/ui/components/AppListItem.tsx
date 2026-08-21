import type { ReactNode } from 'react'

const variantClasses: Record<'default' | 'danger' | 'header', string> = {
  danger: 'flex items-center justify-between gap-x-6 px-4 py-5 font-medium text-danger',
  default: 'flex items-center justify-between gap-x-6 px-4 py-5 font-medium text-text',
  header: 'block px-4 py-5 text-sm font-semibold text-text-muted',
}

export default function AppListItem({
  children,
  is,
}: {
  children: ReactNode
  is?: 'danger' | 'header'
}) {
  return (
    <li className={`${variantClasses[is ?? 'default']} [&>svg]:size-5 [&>svg]:shrink-0`}>
      {children}
    </li>
  )
}
