import type { ReactNode } from 'react'

import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import { AppUnreadDot } from '@/ui/components/AppUnreadDot'
import styles from './NotificationRow.module.css'

interface Props {
  /** The tile before the copy, saying what kind of thing happened. */
  icon: ReactNode
  /** What happened, as a sentence that names the actor inside itself. */
  children: ReactNode
  /** When it happened. */
  when: string
  /** Where the notification leads — the actor, or the workout. */
  to: string
  read: boolean
  /** Marks it seen: a notification is read the moment it is opened. */
  onOpen: () => void
}

/**
 * One thing that happened while the user was away.
 *
 * Not an `<AppListRow>`, though it shares the anatomy: that row's title is a
 * name with a value beside it and truncates to keep the value its room, and
 * this one is a sentence that runs to a second line and has nothing to yield
 * to.
 *
 * Unread is a state rather than a colour of its own — the same row with an ink
 * tile, full-strength copy and a dot. Read rows keep the anatomy and fade.
 */
export const NotificationRow = ({ icon, children, when, to, read, onOpen }: Props) => {
  const { t } = useTranslation()

  return (
    <li className={cn(styles.row, !read && styles.unread)}>
      <Link className={styles.inner} to={to} onClick={onOpen}>
        {!read && <span className="sr-only">{t('profile.unreadNotification')}</span>}
        <span className={styles.copy}>
          <span className={styles.tile} aria-hidden="true">
            {icon}
          </span>
          <span className={styles.body}>
            <span className={styles.what}>{children}</span>
            <span className={styles.when}>{when}</span>
          </span>
        </span>
        {!read && <AppUnreadDot />}
        <ChevronRightIcon className={styles.chevron} aria-hidden="true" />
      </Link>
    </li>
  )
}
