import { BoltIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { isFocusedShellPath } from '@/router/routes'
import { useWorkoutStore } from '@/stores/workout'
import { AppButton } from '@/ui/components/AppButton'
import { cn } from '@/ui/cn'
import { isFinalCountdown, restLabel, restProgress, restRemainingSeconds } from '@/utils/restTimer'
import { useActiveWorkout } from '@/utils/useActiveWorkout'
import styles from './AppRestTimerBanner.module.css'

/**
 * The rest countdown, carried across the app while a workout is paused.
 *
 * It is not shown on the workout screens themselves, which run their own
 * timer; this is what lets the user leave the session to look something up and
 * still be called back when the rest is over.
 */
export const AppRestTimerBanner = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const { savedHref, savedWorkout } = useActiveWorkout()
  const [now, setNow] = useState(() => Date.now())

  const workoutId = savedWorkout?.[0]
  const endsAt = Date.parse(savedWorkout?.[1].restTimerEndsAt ?? '')
  const endsAtMs = Number.isNaN(endsAt) ? undefined : endsAt
  const totalSeconds = savedWorkout?.[1].restTimerTotalSeconds ?? 0

  const remaining = restRemainingSeconds(now, endsAtMs)
  const away = !isFocusedShellPath(pathname)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Each timer is retired once. Without the guard the effect would fire again
  // on every tick after expiry, and navigate the user back repeatedly.
  const retired = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!endsAtMs || !workoutId) return
    if (restRemainingSeconds(now, endsAtMs) > 0) return
    if (retired.current === endsAtMs) return

    retired.current = endsAtMs
    useWorkoutStore.getState().setRestTimer(workoutId)
    if (away) void navigate(savedHref)
  }, [now, endsAtMs, workoutId, away, savedHref, navigate])

  if (remaining <= 0 || !away) return null

  const label = restLabel(remaining)

  return (
    <section
      className={cn(styles.restBanner, isFinalCountdown(remaining) && styles.final)}
      aria-label={`${t('workout.restTimer')}: ${label}`}
    >
      <div className={styles.restBannerInner}>
        <div className={styles.restRow}>
          {/* The label is in the section's aria-label; repeating it here
              would re-announce every second. The digits stand alone — the way
              back beside them already says what the bar is. */}
          <p className={styles.restCopy}>
            <strong aria-hidden="true">{label}</strong>
          </p>
          <AppButton type="link" colour="ghost" size="sm" width="auto" to={savedHref}>
            <BoltIcon className="size-5" aria-hidden="true" /> {t('workout.goToWorkout')}
          </AppButton>
        </div>
        <div className={styles.restProgress} aria-hidden="true">
          <span style={{ width: restProgress(remaining, totalSeconds) }} />
        </div>
      </div>
    </section>
  )
}
