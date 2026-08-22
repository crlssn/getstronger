import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppPageHeader.module.css'

interface Props {
  title: string
  /** A small label above the title, naming the area the screen belongs to. */
  eyebrow?: string
  /** One sentence under the title, saying what the screen is for. */
  lead?: string
  /** The screen's primary action, on the title's trailing edge. */
  action?: ReactNode
  className?: string
}

/**
 * A screen's title block.
 *
 * Five screens laid this out four different ways while setting the same type
 * on the same `h1`. One header keeps titles at one size and one distance from
 * the content below them.
 */
export const AppPageHeader = ({ title, eyebrow, lead, action, className }: Props) => (
  <header className={cn(styles.header, className)}>
    <div className={styles.heading}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
    </div>
    {action}
    {lead && <p className={styles.lead}>{lead}</p>}
  </header>
)
