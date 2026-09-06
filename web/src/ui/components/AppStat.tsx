import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppStat.module.css'

interface Props {
  /** The overline naming the figure — "Distance", "Sets logged". */
  label: string
  value: ReactNode
  /** Set beside the value in the meta register: "km", "min". */
  unit?: string
  /** `record` paints the figure gold, and gold means a personal record. */
  tone?: 'default' | 'record'
  /** `lg` is a card's headline figure; `md` one tile in a grid of them. */
  size?: 'md' | 'lg'
  className?: string
}

/**
 * One measured figure: what it is, how much of it, and in what.
 *
 * The label and the number are a pair, so the pair is the component. The unit
 * is a child rather than part of the string because it is set quieter than the
 * number it follows, and a caller that concatenates the two cannot do that.
 */
export const AppStat = ({
  label,
  value,
  unit,
  tone = 'default',
  size = 'lg',
  className,
}: Props) => (
  <div className={cn(styles.stat, styles[size], className)}>
    <span className={styles.label}>{label}</span>
    <p className={cn(styles.value, tone === 'record' && styles.record)}>
      {value}
      {unit && <span className={styles.unit}>{unit}</span>}
    </p>
  </div>
)
