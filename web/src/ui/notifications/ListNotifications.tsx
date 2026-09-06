import type { Notification } from '@/proto/api/v1/notification_service_pb'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listNotifications, markNotificationAsRead } from '@/http/requests'
import { useNotificationStore } from '@/stores/notifications'
import { AppButton } from '@/ui/components/AppButton'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppList } from '@/ui/components/AppList'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { NotificationUserFollow } from '@/ui/features/NotificationUserFollow'
import { NotificationWorkoutComment } from '@/ui/features/NotificationWorkoutComment'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'

/** Everything that happened while the user was away, newest first. */
export const ListNotifications = () => {
  const { t } = useTranslation()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setFailed(false)
    const res = await listNotifications(currentPageToken())
    if (!res) {
      setFailed(true)
      return
    }

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
  if (failed && notifications.length === 0)
    return <AppErrorState onRetry={() => void fetchNotifications()} />

  return (
    <>
      {/* A ghost button in the title row, not a floating pill: pills are for
          tags, actions are buttons. */}
      {hasUnread && (
        <PageNavAction>
          <AppButton
            type="button"
            colour="ghost"
            size="sm"
            width="auto"
            disabled={markingAllAsRead}
            onClick={() => void markAllAsRead()}
          >
            {markingAllAsRead
              ? t('profile.markingNotificationsAsRead')
              : t('profile.markAllAsRead')}
          </AppButton>
        </PageNavAction>
      )}

      {notifications.length === 0 && !failed && (
        <AppEmptyState
          action="none"
          body={t('notifications.emptyBody')}
          title={t('notifications.emptyTitle')}
        />
      )}

      {notifications.length > 0 && (
        <AppList canFetch={hasMorePages && !failed} onFetch={() => void fetchNotifications()}>
          {notifications.map((notification) => (
            <Fragment key={notification.id}>
              {notification.type.case === 'userFollowed' && (
                <NotificationUserFollow
                  actor={notification.type.value.actor}
                  read={notification.read}
                  timestamp={notification.notifiedAtUnix}
                  onOpen={() => markAsRead(notification)}
                />
              )}
              {notification.type.case === 'workoutComment' && (
                <NotificationWorkoutComment
                  actor={notification.type.value.actor}
                  read={notification.read}
                  timestamp={notification.notifiedAtUnix}
                  workout={notification.type.value.workout}
                  onOpen={() => markAsRead(notification)}
                />
              )}
            </Fragment>
          ))}
        </AppList>
      )}

      {failed && <AppErrorState compact onRetry={() => void fetchNotifications()} />}
    </>
  )
}
