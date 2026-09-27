import { ArrowTrendingUpIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { dateLocale } from '@/i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { useProgressStore } from '@/stores/progress'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppList } from '@/ui/components/AppList'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { cn } from '@/ui/cn'
import { RecordRow } from '@/ui/features/RecordRow'
import { WorkoutChart } from '@/ui/features/WorkoutChart'
import {
  priorVolume,
  rangeSeries,
  totalVolume,
  withinRange,
  type VolumeGranularity,
  type VolumeRange,
} from '@/utils/dailyVolume'
import { formatNumber } from '@/utils/numbers'
import styles from './ProgressView.module.css'

/* Spelled out rather than built from the grain's name: "day" + "lyTotals"
   asks for progress.daylyTotals, which renders as the key. */
const totalsLabel: Record<VolumeGranularity, string> = {
  day: 'progress.dailyTotals',
  week: 'progress.weeklyTotals',
  month: 'progress.monthlyTotals',
}

const periodOptions: VolumeRange[] = ['7D', '4W', '3M', '1Y']

/** Training volume over a chosen range, and the personal bests behind it. */
export const ProgressView = () => {
  const { t } = useTranslation()

  const dashboard = useDashboardStore((state) => state.dashboard)
  const workouts = useProgressStore((state) => state.workouts)
  const loaded = useProgressStore((state) => state.loaded)
  const failed = useProgressStore((state) => state.failed)
  const dashboardFailed = useDashboardStore((state) => state.failed)

  const range = useProgressStore((state) => state.range)
  const setRange = useProgressStore((state) => state.setRange)

  const load = () =>
    void Promise.all([useDashboardStore.getState().load(), useProgressStore.getState().load()])

  useEffect(load, [])

  const filtered = useMemo(() => withinRange(workouts, range), [workouts, range])
  // The range picks the grain, and the chip beside the total names it.
  const series = useMemo(() => rangeSeries(workouts, range), [workouts, range])
  const total = totalVolume(filtered)
  const prior = useMemo(() => priorVolume(workouts, range), [workouts, range])
  // Rounded before it is judged, so a change too small to show says nothing
  // rather than "0%"; and nothing is said about a period with no training.
  const change = prior && filtered.length > 0 ? Math.round(((total - prior) / prior) * 100) : 0
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
            <AppSegmented
              className={styles.periodPicker}
              density="compact"
              label={t('progress.periodAria')}
              options={periodOptions.map((option) => ({ label: option, value: option }))}
              value={range}
              onChange={setRange}
            />

            <div className={styles.chartHeading}>
              <div>
                <h2>{t('progress.trainingVolume')}</h2>
                <div className={styles.totalRow}>
                  <p className={styles.total} id="training-volume">
                    {formatNumber(total)} {t('common.kg')}
                  </p>
                  {change !== 0 && (
                    <span className={cn(styles.change, change > 0 && styles.gain)}>
                      {t('progress.vsPrior', {
                        delta: new Intl.NumberFormat(dateLocale(), {
                          signDisplay: 'always',
                          style: 'percent',
                        }).format(change / 100),
                      })}
                    </span>
                  )}
                </div>
              </div>
              <span>
                <ArrowTrendingUpIcon aria-hidden="true" /> {t(totalsLabel[series.granularity])}
              </span>
            </div>

            {filtered.length > 0 ? (
              <WorkoutChart series={series} />
            ) : (
              <p className={styles.chartEmpty}>{t('progress.emptyRange')}</p>
            )}
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
