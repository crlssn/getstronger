import type { ReactNode } from 'react'

import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import styles from './AppList.module.css'

interface Props {
  children: ReactNode
  /** Whether another page exists; the spinner row only appears while it does. */
  canFetch?: boolean
  onFetch?: () => void
  className?: string
}

export const AppList = ({ children, canFetch = false, onFetch, className }: Props) => {
  const { t } = useTranslation()
  const sentinel = useInfiniteScroll<HTMLLIElement>(() => onFetch?.(), canFetch)

  return (
    <ul role="list" className={cn(styles.list, className)}>
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
