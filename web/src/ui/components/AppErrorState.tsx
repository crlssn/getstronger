import { ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import styles from './AppErrorState.module.css'

interface Props {
  /** What failed, in the screen's own words; defaults to the generic failure. */
  title?: string
  /** The line under the title. The compact row is one line and ignores it. */
  body?: string
  /** One row instead of a block, for a failure under content already on screen. */
  compact?: boolean
  className?: string
  onRetry: () => void
}

/**
 * A fetch that failed, and the button that tries it again.
 *
 * The counterpart to `<AppEmptyState>`, and the reason both exist: a screen
 * that only checks `length === 0` renders an unreachable server as an empty
 * list, which is the more confident of the two claims and the harder one to
 * argue with. `onRetry` is required for the same reason `action` is over
 * there — a dead end is not a state.
 *
 * It stays a card in the content area rather than becoming a toast, because a
 * load that failed is a state of the screen and not a thing that just
 * happened. What it borrows is the toast's icon and its danger tokens, so a
 * failure reads the same whichever of the two containers reports it.
 */
export const AppErrorState = ({ title, body, compact, className, onRetry }: Props) => {
  const { t } = useTranslation()

  // Destructive rather than secondary in the row: it sits on the danger
  // surface, where a bordered button reads as a second, competing box.
  const retry = (
    <AppButton
      type="button"
      colour={compact ? 'destructive' : 'secondary'}
      size="sm"
      width="auto"
      onClick={onRetry}
    >
      {t('common.retry')}
    </AppButton>
  )

  if (compact) {
    return (
      <div className={cn(styles.compactError, className)} role="alert">
        <span>{title ?? t('common.loadFailed')}</span>
        {retry}
      </div>
    )
  }

  return (
    <div className={cn(styles.errorState, className)} role="alert">
      <span className={styles.errorIcon}>
        <ExclamationCircleIcon aria-hidden="true" />
      </span>
      <h2>{title ?? t('common.loadFailed')}</h2>
      <p>{body ?? t('common.loadFailedBody')}</p>
      {retry}
    </div>
  )
}
