import type { Notification } from '@/proto/api/v1/notification_service_pb'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listNotifications, markNotificationAsRead } from '@/http/requests'
import { useNotificationStore } from '@/stores/notifications'
import { cn } from '@/ui/cn'
import { AppList } from '@/ui/components/AppList'
import { AppListItem } from '@/ui/components/AppListItem'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { NotificationUserFollow } from '@/ui/features/NotificationUserFollow'
import { NotificationWorkoutComment } from '@/ui/features/NotificationWorkoutComment'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './ListNotifications.module.css'

/** Everything that happened while the user was away, newest first. */
export const ListNotifications = () => {
  const { t } = useTranslation()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false)

  const fetchNotifications = useCallback(async () => {
    const res = await listNotifications(currentPageToken())
    if (!res) return

    setNotifications((current) => appendPage(current, res.notifications))
    setFromResponse(res.pagination)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await fetchNotifications()
      setLoaded(true)
    }
    void load()
  }, [fetchNotifications])

  const hasUnread = notifications.some((notification) => !notification.read)

  // Marked here first, then on the server: the row and the tab-bar count both
  // answer to the tap, not to the round trip.
  const markAsRead = (notification: Notification) => {
    if (notification.read) return

    setNotifications((current) =>
      current.map((candidate) =>
        candidate.id === notification.id ? { ...candidate, read: true } : candidate,
      ),
    )
    const store = useNotificationStore.getState()
    useNotificationStore.setState({ unreadCount: Math.max(0, store.unreadCount - 1) })

    void markNotificationAsRead(notification.id, true).then(() =>
      useNotificationStore.getState().refreshUnreadNotifications(),
    )
  }

  const markAllAsRead = async () => {
    if (!hasUnread || markingAllAsRead) return

    setMarkingAllAsRead(true)
    try {
      const response = await markNotificationAsRead()
      if (!response) return

      setNotifications((current) =>
        current.map((notification) => ({ ...notification, read: true })),
      )
      useNotificationStore.setState({ unreadCount: 0 })
      void useNotificationStore.getState().refreshUnreadNotifications()
    } finally {
      setMarkingAllAsRead(false)
    }
  }

  if (!loaded) return <AppSkeleton />

  return (
    <>
      {/* A ghost button in the title row, not a floating pill: pills are for
          tags, actions are buttons. */}
      {hasUnread && (
        <PageNavAction>
          <button
            type="button"
            className={styles.markAllRead}
            disabled={markingAllAsRead}
            onClick={() => void markAllAsRead()}
          >
            {markingAllAsRead
              ? t('profile.markingNotificationsAsRead')
              : t('profile.markAllAsRead')}
          </button>
        </PageNavAction>
      )}

      <AppList canFetch={hasMorePages} onFetch={() => void fetchNotifications()}>
        {notifications.map((notification) => (
          <AppListItem
            key={notification.id}
            className={cn(styles.notificationItem, !notification.read && styles.unread)}
            onClick={() => markAsRead(notification)}
          >
            {!notification.read && (
              <span className="sr-only">{t('profile.unreadNotification')}</span>
            )}

            {notification.type.case === 'userFollowed' && (
              <NotificationUserFollow
                actor={notification.type.value.actor}
                timestamp={notification.notifiedAtUnix}
              />
            )}
            {notification.type.case === 'workoutComment' && (
              <NotificationWorkoutComment
                actor={notification.type.value.actor}
                workout={notification.type.value.workout}
                timestamp={notification.notifiedAtUnix}
              />
            )}

            {!notification.read && <span className={styles.unreadDot} aria-hidden="true" />}
          </AppListItem>
        ))}

        {notifications.length === 0 && <AppListItem>{t('notifications.empty')}</AppListItem>}
      </AppList>
    </>
  )
}
