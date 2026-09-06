import { cn } from '@/ui/cn'
import styles from './AppUnreadDot.module.css'

interface Props {
  className?: string
}

/**
 * The ink dot on a row not yet seen, before the chevron at its edge.
 *
 * Decorative on its own — the row tells a screen reader it is unread in
 * words, because a dot tells it nothing.
 */
export const AppUnreadDot = ({ className }: Props) => (
  <span aria-hidden="true" className={cn(styles.dot, className)} />
)
