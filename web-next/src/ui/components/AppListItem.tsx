import type { ComponentProps, ReactNode } from 'react'

import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppListItem.module.css'

interface Props extends ComponentProps<'li'> {
  /** `danger` for a destructive row, `header` for a section label. */
  is?: 'danger' | 'header'
  children: ReactNode
}

export const AppListItem = ({ is, children, className, ...rest }: Props) => (
  <li className={cn(styles.item, is && styles[is], className)} {...rest}>
    {children}
  </li>
)

interface LinkItemProps extends Omit<ComponentProps<typeof Link>, 'className'> {
  to: string
  children: ReactNode
  className?: string
}

export const AppListItemLink = ({ children, className, ...rest }: LinkItemProps) => (
  <li className={className}>
    <Link className={styles.link} {...rest}>
      {children}
    </Link>
  </li>
)
