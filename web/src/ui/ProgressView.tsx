import { ArrowTrendingUpIcon, ChevronRightIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useDashboardStore } from '@/stores/dashboard'
import { useProgressStore } from '@/stores/progress'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { WorkoutChart } from '@/ui/features/WorkoutChart'
import { totalVolume, withinDays } from '@/utils/dailyVolume'
import { formatToShortDateTime } from '@/utils/datetime'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import { formatNumber } from '@/utils/numbers'
import styles from './ProgressView.module.css'

const periodOptions = [
  { days: 7, label: '7D' },
  { days: 28, label: '4W' },
  { days: 90, label: '3M' },
  { days: 365, label: '1Y' },
]

/** Training volume over a chosen range, and the personal bests behind it. */
export const ProgressView = () => {
  const { t } = useTranslation()

  const dashboard = useDashboardStore((state) => state.dashboard)
  const workouts = useProgressStore((state) => state.workouts)
  const loaded = useProgressStore((state) => state.loaded)

  const [periodDays, setPeriodDays] = useState(28)

  useEffect(() => {
    void Promise.all([useDashboardStore.getState().load(), useProgressStore.getState().load()])
  }, [])

  const filtered = useMemo(() => withinDays(workouts, periodDays), [workouts, periodDays])
  const personalBests = dashboard?.personalBests ?? []

  return (
    <div className={styles.stack}>
      {/* Progress is a screen pushed onto the Me tab, so the nav bar above
          carries its title; the PB chip joins it in the title row. It only
          renders once there is something to celebrate, because a chip that
          exists to celebrate should not report a zero. */}
      {personalBests.length > 0 && (
        <PageNavAction>
          <span className={styles.recordCount}>
            <TrophyIcon aria-hidden="true" />{' '}
            {t('progress.personalBests', { count: personalBests.length })}
          </span>
        </PageNavAction>
      )}

      {/* The card keys off the full year of history, not the selected range, so
          a range with no data keeps the picker on screen and says so instead of
          silently unmounting the controls. */}
      {!loaded ? (
        <AppSkeleton />
      ) : (
        workouts.length > 0 && (
          <section className={styles.chartCard}>
            <div className={styles.chartHeading}>
              <div>
                <p className={styles.eyebrow}>{t('progress.trainingVolume')}</p>
                <h2>
                  {formatNumber(totalVolume(filtered))} {t('common.kg')}
                </h2>
              </div>
              <span>
                <ArrowTrendingUpIcon aria-hidden="true" /> {t('progress.dailyTotals')}
              </span>
            </div>

            {filtered.length > 0 ? (
              <WorkoutChart workouts={filtered} />
            ) : (
              <p className={styles.chartEmpty}>{t('progress.emptyRange')}</p>
            )}

            <AppSegmented
              className={styles.periodPicker}
              density="compact"
              label={t('progress.periodAria')}
              options={periodOptions.map((option) => ({
                label: option.label,
                value: option.days,
              }))}
              value={periodDays}
              onChange={setPeriodDays}
            />
          </section>
        )
      )}

      {loaded && (
        <section className={styles.recordsCard}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{t('progress.bestLifts')}</p>
            <h2>{t('progress.personalRecords')}</h2>
          </div>

          {personalBests.length > 0 ? (
            <div className={styles.recordList}>
              {personalBests.map((personalBest) => (
                <Link key={personalBest.set?.id} to={`/exercises/${personalBest.exercise?.id}`}>
                  <span className={styles.recordIcon}>
                    <TrophyIcon aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <strong>{personalBest.exercise?.name}</strong>
                    <ExerciseTags compact tags={personalBest.exercise?.tags} />
                    {personalBest.set?.metadata?.createdAt && (
                      <small>{formatToShortDateTime(personalBest.set.metadata.createdAt)}</small>
                    )}
                  </span>
                  <span className={styles.recordValue}>
                    {personalBest.set
                      ? formatExerciseSet(personalBest.set, personalBest.exercise)
                      : ''}
                  </span>
                  <ChevronRightIcon className={styles.chevron} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <AppEmptyState
              action={{ label: t('home.startWorkout'), to: '/workout' }}
              body={t('progress.emptyBody')}
              title={t('progress.emptyTitle')}
              icon={<TrophyIcon />}
            />
          )}
        </section>
      )}
    </div>
  )
}
