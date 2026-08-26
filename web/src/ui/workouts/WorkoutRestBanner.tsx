import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { cn } from '@/ui/cn'
import { isFinalCountdown, restLabel, restProgress } from '@/utils/restTimer'
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
 * It sits under the session header rather than over it, and it is drawn in the
 * app's own ink: a saturated green band at full bleed was the loudest surface
 * in a product that is otherwise ink on warm grey, and it read as a different
 * application. Green survives as the progress fill, where it means the one
 * thing green means — this is running right now.
 *
 * The digits are aria-hidden: a live region counting every second would talk
 * over everything else.
 */
export const WorkoutRestBanner = ({ remainingSeconds, totalSeconds, onAddTime, onSkip }: Props) => {
  const { t } = useTranslation()

  if (remainingSeconds <= 0) return null

  return (
    <section
      className={cn(styles.restBanner, isFinalCountdown(remainingSeconds) && styles.final)}
      aria-label={t('workout.restTimer')}
    >
      <div className={styles.restRow}>
        <p className={styles.restCopy}>
          <strong aria-hidden="true">{restLabel(remainingSeconds)}</strong>
          <span>{t('workout.resting')}</span>
        </p>
        <div className={styles.restActions}>
          <AppButton type="button" colour="ghost" size="sm" width="auto" onClick={onAddTime}>
            {t('workout.addSeconds')}
          </AppButton>
          <AppButton
            type="button"
            colour="ghost"
            size="sm"
            width="auto"
            className={styles.skip}
            onClick={onSkip}
          >
            {t('workout.skip')}
          </AppButton>
        </div>
      </div>
      <div className={styles.restProgress} aria-hidden="true">
        <span style={{ width: restProgress(remainingSeconds, totalSeconds) }} />
      </div>
    </section>
  )
}
