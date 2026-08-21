import { cn } from '@/ui/cn'
import styles from './ExerciseTags.module.css'

interface Props {
  tags?: string[]
  /** The denser variant, for tags sitting inside a list row. */
  compact?: boolean
}

/** An exercise's tags as chips, or nothing at all when it has none. */
export const ExerciseTags = ({ tags = [], compact = false }: Props) => {
  if (!tags.length) return null

  return (
    <span className={cn(styles.tags, compact && styles.compact)}>
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </span>
  )
}
