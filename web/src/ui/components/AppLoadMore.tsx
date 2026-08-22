import { cn } from '@/ui/cn'
import styles from './AppLoadMore.module.css'

interface Props {
  /** What this list calls its next page, already translated. */
  label: string
  onFetch: () => void
  loading?: boolean
  className?: string
}

/**
 * The button under a paginated list.
 *
 * Prefer `<AppList onFetch>`, which brings the next page in on scroll. This is
 * for lists that are not an `<AppList>` — and it exists because five of them
 * had five different-looking "show more" buttons.
 */
export const AppLoadMore = ({ label, onFetch, loading = false, className }: Props) => (
  <button
    type="button"
    className={cn(styles.loadMore, className)}
    disabled={loading}
    aria-busy={loading || undefined}
    onClick={onFetch}
  >
    {label}
  </button>
)
