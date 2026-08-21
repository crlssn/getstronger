import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'

interface Props extends ComponentProps<'div'> {
  children: ReactNode
}

export const AppCard = ({ children, className, ...rest }: Props) => (
  <div className={cn('card mb-4', className)} {...rest}>
    {children}
  </div>
)
