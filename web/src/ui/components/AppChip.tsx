import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppChip.module.css'

interface Props {
  /** `record` is gold, and gold means a personal record — nothing else. */
  tone?: 'neutral' | 'record'
  children: ReactNode
  className?: string
}

/**
 * A small pill of fact beside a title: a PR marker, a count.
 *
 * The record pill existed three times — champagne on the exercise history,
 * filled gold on the workout banner, and a colour with no pill at all on the
 * feed, where only a screen reader was told. One shape now, so a record reads
 * the same wherever it was set.
 */
export const AppChip = ({ tone = 'neutral', children, className }: Props) => (
  <span className={cn(styles.chip, styles[tone], className)}>{children}</span>
)
