import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

interface Props extends Omit<ComponentProps<'textarea'>, 'className'> {
  placeholder: string
  rows: number
  className?: string
}

export const AppTextarea = ({ className, ...rest }: Props) => (
  <textarea
    className={cn(
      'mb-1 w-full rounded-control border border-ink-border shadow-card focus:border-ink-muted focus:ring-ink-muted sm:text-sm',
      className,
    )}
    {...rest}
  />
)
