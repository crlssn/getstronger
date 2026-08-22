import type { CSSProperties } from 'react'

import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { cn } from '@/ui/cn'
import {
  isFinalCountdown,
  isFinalMinute,
  restHue,
  restLabel,
  restProgress,
} from '@/utils/restTimer'
import styles from './WorkoutRestBanner.module.css'

interface Props {
  remainingSeconds: number
  totalSeconds: number
  onAddTime: () => void
  onSkip: () => void
}

/**
 * The rest countdown, on the workout screen itself.
 *
 * The band is the focal point while resting, so it rides over the session
 * header rather than pushing it down. The digits are aria-hidden: a live region
 * counting every second would talk over everything else.
 */
export const WorkoutRestBanner = ({ remainingSeconds, totalSeconds, onAddTime, onSkip }: Props) => {
  const { t } = useTranslation()

  if (remainingSeconds <= 0) return null

  // Flipping between two classes restarts the one-shot pulse, so each beat
  // begins exactly when the countdown digit changes.
  const tick = remainingSeconds % 2 === 0 ? styles.tickEven : styles.tickOdd

  return (
    <section
      className={cn(
        styles.restBanner,
        isFinalMinute(remainingSeconds) && styles.bright,
        isFinalCountdown(remainingSeconds) && styles.final,
        isFinalCountdown(remainingSeconds) && tick,
      )}
      style={{ '--rest-hue': restHue(remainingSeconds) } as CSSProperties}
      aria-label={t('workout.restTimer')}
    >
      <div className={styles.restBannerInner}>
        <div className={styles.restCopy}>
          <strong aria-hidden="true">{restLabel(remainingSeconds)}</strong>
        </div>
        <div className={styles.restActions}>
          <AppButton type="button" colour="ghost" size="sm" width="auto" onClick={onAddTime}>
            {t('workout.addSeconds')}
          </AppButton>
          <AppButton type="button" colour="ghost" size="sm" width="auto" onClick={onSkip}>
            {t('workout.skip')}
          </AppButton>
        </div>
        <div className={styles.restProgress} aria-hidden="true">
          <span style={{ width: restProgress(remainingSeconds, totalSeconds) }} />
        </div>
      </div>
    </section>
  )
}
