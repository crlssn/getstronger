import type { User } from '@/proto/api/v1/shared_pb'
import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { DropdownItem } from '@/types/dropdown'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useParams } from 'react-router-dom'

import { followUser, getUser, listWorkouts, unfollowUser } from '@/http/requests'
import posthog from '@/posthog'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'
import { AppButton } from '@/ui/components/AppButton'
import { AppCard } from '@/ui/components/AppCard'
import { AppSegmentedNav } from '@/ui/components/AppSegmented'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { DropdownButton } from '@/ui/components/DropdownButton'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { WorkoutChart } from '@/ui/features/WorkoutChart'
import styles from './UserView.module.css'

/**
 * Someone's profile: who they are, how they are training, and four tabs of
 * detail rendered by the nested route below.
 */
export const UserView = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const signedInUserId = useAuthStore((state) => state.userId)

  const [user, setUser] = useState<User>()
  const [workouts, setWorkouts] = useState<Workout[]>([])

  const fetchUser = useCallback(async () => {
    const res = await getUser(id)
    if (res?.user) setUser(res.user)
    return res?.user
  }, [id])

  useEffect(() => {
    const load = async () => {
      // Cleared first so the previous profile's chart is never shown under the
      // next profile's name while its fetch is in flight.
      setWorkouts([])
      setUser(undefined)

      const loaded = await fetchUser()
      if (!loaded) return

      // Not "Me": that is the tab, and this is the page other people see. Two
      // screens with one name left no way to tell from the header which of
      // them you were looking at.
      usePageTitleStore
        .getState()
        .setPageTitle(
          loaded.id === signedInUserId ? t('profile.publicProfileTitle') : loaded.name,
        )

      // Only the most recent workouts, which is all the chart plots.
      const res = await listWorkouts([loaded.id], new Uint8Array(0))
      if (res) setWorkouts(res.workouts)
    }

    void load()
  }, [fetchUser, signedInUserId, t])

  const notMe = Boolean(user?.id) && user?.id !== signedInUserId

  const onFollow = async () => {
    const response = await followUser(id)
    if (!response) return
    posthog.capture('user_followed')
    await fetchUser()
  }

  const profileActions: DropdownItem[] = [
    {
      destructive: true,
      func: async () => {
        const response = await unfollowUser(id)
        if (!response) return
        posthog.capture('user_unfollowed')
        await fetchUser()
      },
      title: t('profile.unfollow', { name: user?.name }),
    },
  ]

  const tabs = [
    { href: `/users/${id}`, name: t('common.workouts') },
    { href: `/users/${id}/personal-bests`, name: t('profile.personalBests') },
    { href: `/users/${id}/follows`, name: t('profile.follows') },
    { href: `/users/${id}/followers`, name: t('profile.followers') },
  ]

  return (
    <>
      {notMe &&
        (user?.followed ? (
          <PageNavAction>
            <DropdownButton label={t('profile.actionsLabel')} items={profileActions} />
          </PageNavAction>
        ) : (
          <div className={styles.profileAction}>
            <AppButton colour="primary" type="button" onClick={() => void onFollow()}>
              {t('profile.follow', { name: user?.name })}
            </AppButton>
          </div>
        ))}

      {/* Two points is the fewest that can show a direction. */}
      {/* The chart decides what it can honestly draw: a figure under three
          points, bars above. */}
      {workouts.length > 0 && (
        <AppCard className={styles.trendCard}>
          <h2>{t('profile.trend')}</h2>
          <WorkoutChart workouts={workouts} />
        </AppCard>
      )}

      {user ? (
        <AppSegmentedNav
          className={styles.profileTabs}
          label={t('profile.sectionsAria')}
          links={tabs.map((tab) => ({ label: tab.name, to: tab.href }))}
        />
      ) : (
        <AppSkeleton className={styles.profileTabs} />
      )}

      <Outlet />
    </>
  )
}
