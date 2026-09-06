import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'

interface Props extends ComponentProps<'div'> {
  children: ReactNode
}

/**
 * The panel: rounded, on `--color-surface`, lifted by the card shadow.
 *
 * No border — elevation and a hairline never combine, so a top-level card
 * takes the shadow and a container nested inside one closes its edge instead.
 * A component that styles its own container applies the `card` utility in its
 * CSS module: the same shape, defined once.
 */
export const AppCard = ({ children, className, ...rest }: Props) => (
  <div className={cn('card mb-4', className)} {...rest}>
    {children}
  </div>
)
