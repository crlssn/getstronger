import { ArrowTrendingUpIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDashboardStore } from '@/stores/dashboard'
import { useProgressStore } from '@/stores/progress'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppList } from '@/ui/components/AppList'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { RecordRow } from '@/ui/features/RecordRow'
import { WorkoutChart } from '@/ui/features/WorkoutChart'
import { totalVolume, volumeSeries, withinDays, type VolumeGranularity } from '@/utils/dailyVolume'
import { formatNumber } from '@/utils/numbers'
import styles from './ProgressView.module.css'

/* Spelled out rather than built from the grain's name: "day" + "lyTotals"
   asks for progress.daylyTotals, which renders as the key. */
const totalsLabel: Record<VolumeGranularity, string> = {
  day: 'progress.dailyTotals',
  week: 'progress.weeklyTotals',
  month: 'progress.monthlyTotals',
}

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
  const failed = useProgressStore((state) => state.failed)
  const dashboardFailed = useDashboardStore((state) => state.failed)

  const [periodDays, setPeriodDays] = useState(28)

  const load = () =>
    void Promise.all([useDashboardStore.getState().load(), useProgressStore.getState().load()])

  useEffect(load, [])

  const filtered = useMemo(() => withinDays(workouts, periodDays), [workouts, periodDays])
  // The chart aggregates to weeks once a range has more days than bars will
  // fit, so the chip beside the total says which grain is on screen.
  const granularity = useMemo(() => volumeSeries(filtered).granularity, [filtered])
  const personalBests = dashboard?.personalBests ?? []
  // Nothing to chart and nothing to list is not two empty sections, it is an
  // account with no training in it — and a "Personal records" card holding the
  // words "Nothing to chart yet" reads as a header that lost its records.
  const nothingYet = workouts.length === 0 && personalBests.length === 0

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
      ) : failed ? (
        // The store has always set this flag; the section used to vanish
        // instead of reading it, which reads as an account with no history.
        <AppErrorState onRetry={load} />
      ) : (
        workouts.length > 0 && (
          <section className={styles.chartCard}>
            <div className={styles.chartHeading}>
              <div>
                <h2>{t('progress.trainingVolume')}</h2>
                <p className={styles.total} id="training-volume">
                  {formatNumber(totalVolume(filtered))} {t('common.kg')}
                </p>
              </div>
              <span>
                <ArrowTrendingUpIcon aria-hidden="true" /> {t(totalsLabel[granularity])}
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

      {loaded && !failed && nothingYet && !dashboardFailed && (
        <AppEmptyState
          action={{ label: t('home.startWorkout'), to: '/workout' }}
          body={t('progress.emptyBody')}
          title={t('progress.emptyTitle')}
        />
      )}

      {loaded && !nothingYet && (
        <section className={styles.recordsCard}>
          <div className={styles.sectionHeading}>
            <h2>{t('progress.personalRecords')}</h2>
          </div>

          {dashboardFailed && personalBests.length === 0 ? (
            <AppErrorState onRetry={load} />
          ) : personalBests.length > 0 ? (
            <AppList className={styles.recordList}>
              {personalBests.map((personalBest) => (
                <RecordRow key={personalBest.set?.id} record={personalBest} />
              ))}
            </AppList>
          ) : (
            // The screen has a chart on it, so this is one empty section
            // rather than an empty account.
            <AppEmptyInline>{t('progress.noRecordsYet')}</AppEmptyInline>
          )}
        </section>
      )}
    </div>
  )
}
