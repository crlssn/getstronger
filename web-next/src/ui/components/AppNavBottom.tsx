import {
  BoltIcon,
  BookOpenIcon,
  HomeIcon,
  RectangleStackIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import {
  BoltIcon as BoltIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  HomeIcon as HomeIconSolid,
  RectangleStackIcon as RectangleStackIconSolid,
  UserIcon as UserIconSolid,
} from '@heroicons/react/24/solid'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { useNotificationStore } from '@/stores/notifications'
import { cn } from '@/ui/cn'
import { useActiveWorkout } from '@/utils/useActiveWorkout'
import { workoutTabTimer } from '@/utils/workoutClock'
import styles from './AppNavBottom.module.css'

/** Ticks once a second, and only while the tab bar is on screen. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  return now
}

export const AppNavBottom = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const now = useNow()

  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const { savedHref, savedWorkout, savedWorkoutStartedAtMs, savedRestTimerEndsAtMs } =
    useActiveWorkout()

  const onWorkout = pathname === '/workout' || pathname.startsWith('/workouts/')
  // The duration is not shown on the workout screens themselves; the session
  // already has a clock there.
  const timer = onWorkout
    ? ''
    : workoutTabTimer(now, savedWorkoutStartedAtMs, savedRestTimerEndsAtMs)

  const navigation = [
    {
      href: '/home',
      icon: HomeIcon,
      iconActive: HomeIconSolid,
      name: t('nav.home'),
      active: pathname === '/home',
      badge: 0,
      timer: '',
    },
    {
      href: savedWorkout ? savedHref : '/workout',
      icon: BoltIcon,
      iconActive: BoltIconSolid,
      name: t('nav.workout'),
      active: onWorkout,
      badge: 0,
      timer,
    },
    {
      href: '/plans',
      icon: RectangleStackIcon,
      iconActive: RectangleStackIconSolid,
      name: t('nav.training'),
      active: pathname.startsWith('/plans') || pathname.startsWith('/routines'),
      badge: 0,
      timer: '',
    },
    {
      href: '/exercises',
      icon: BookOpenIcon,
      iconActive: BookOpenIconSolid,
      name: t('nav.exercises'),
      active: pathname.startsWith('/exercises'),
      badge: 0,
      timer: '',
    },
    {
      href: '/profile',
      icon: UserIcon,
      iconActive: UserIconSolid,
      name: t('nav.me'),
      active:
        pathname.startsWith('/profile') ||
        pathname.startsWith('/notifications') ||
        pathname.startsWith('/progress'),
      badge: unreadCount,
      timer: '',
    },
  ]

  return (
    <nav className={styles.bottomNav} aria-label={t('nav.primary')}>
      <div className={styles.bottomNavInner}>
        {navigation.map((item) => {
          const Icon = item.active ? item.iconActive : item.icon
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(styles.tab, item.active && styles.active)}
              aria-current={item.active ? 'page' : undefined}
              aria-label={item.timer ? item.name : undefined}
            >
              <span className={styles.navIcon}>
                <Icon aria-hidden="true" />
                {item.badge > 0 && !item.active && (
                  <span className={styles.notificationBadge}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              {/* The link keeps its name via aria-label; the ticking duration
                  is decorative so it does not re-announce every second. */}
              {item.timer ? (
                <span className={styles.timerBadge} aria-hidden="true">
                  {item.timer}
                </span>
              ) : (
                <span className={styles.navLabel}>{item.name}</span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
