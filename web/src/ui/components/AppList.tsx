import type { ReactNode } from 'react'

import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import styles from './AppList.module.css'

interface Props {
  children: ReactNode
  /**
   * A section label above the first row, and the list's accessible name.
   *
   * One card, one heading: a list that needs two of them is two cards.
   */
  heading?: string
  /** Whether another page exists; the spinner row only appears while it does. */
  canFetch?: boolean
  onFetch?: () => void
  className?: string
}

/**
 * The card that holds rows, and fetches its next page as the bottom arrives.
 *
 * It is the plain container as well as the infinite one — `canFetch` decides
 * whether the sentinel row exists at all, and a list that has everything it
 * will ever have simply leaves it out.
 */
export const AppList = ({ children, heading, canFetch = false, onFetch, className }: Props) => {
  const { t } = useTranslation()
  const sentinel = useInfiniteScroll<HTMLLIElement>(() => onFetch?.(), canFetch)

  return (
    <ul role="list" aria-label={heading} className={cn(styles.list, className)}>
      {/* The heading is the list's name to a screen reader, so reading it
          again as the first row would announce the section twice. */}
      {heading && (
        <li className={styles.heading} aria-hidden="true">
          {heading}
        </li>
      )}
      {children}
      {canFetch && (
        <li ref={sentinel} className={styles.fetching} aria-live="polite">
          <span className="sr-only">{t('common.loading')}</span>
          <ArrowPathIcon className="size-7 animate-spin" aria-hidden="true" />
        </li>
      )}
    </ul>
  )
}
