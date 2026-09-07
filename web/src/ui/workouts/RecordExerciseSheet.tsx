import type { Exercise } from '@/proto/api/v1/shared_pb'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExercises, listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppLoadMore } from '@/ui/components/AppLoadMore'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { appendPage } from '@/utils/appendPage'
import { isDistanceTimeExercise } from '@/utils/exerciseMeasurements'
import { usePagination } from '@/utils/usePagination'
import styles from './RecordExerciseSheet.module.css'

interface Props {
  /** What the session measured, said under the question: "23:07 · 7.62 km". */
  summary: string
  saving: boolean
  onSave: (exercise: Exercise) => void
  onClose: () => void
}

// One page of the athlete's own history is enough to say what they run and
// ride most weeks; older workouts add names nobody is about to pick.
const recentWorkouts = 20

/**
 * Names the session that has just ended.
 *
 * A recording measures a route before it knows whose route it is, so the choice
 * comes last. Only exercises measured by distance and time are offered: they
 * are the ones a route, a duration and a pace add up to.
 */
export const RecordExerciseSheet = ({ summary, saving, onSave, onClose }: Props) => {
  const { t } = useTranslation()
  const { currentPageToken, hasMorePages, setFromResponse } = usePagination()

  const [options, setOptions] = useState<Exercise[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [selected, setSelected] = useState<Exercise>()
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')

  const fetchPage = useCallback(async () => {
    setFailed(false)
    const res = await listExercises(currentPageToken())
    if (!res) {
      setFailed(true)
      return
    }

    setOptions((current) => appendPage(current, res.exercises))
    setFromResponse(res.pagination)
    setLoaded(true)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await fetchPage()
      setLoading(false)
    }
    void load()
  }, [fetchPage])

  // What the athlete has logged lately, which is what they are about to pick.
  // A failure here costs the ordering and nothing else, so it goes unreported.
  useEffect(() => {
    const userId = useAuthStore.getState().userId
    if (!userId) return
    let disposed = false
    void listWorkouts([userId], new Uint8Array(), recentWorkouts).then((res) => {
      if (disposed || !res) return
      setRecent(
        res.workouts.flatMap((workout) =>
          workout.exerciseSets.map((entry) => entry.exercise?.id ?? ''),
        ),
      )
    })
    return () => {
      disposed = true
    }
  }, [])

  const query = search.trim().toLowerCase()
  // Recent workouts arrive newest first, so a lower position is a more recent
  // exercise and anything missing sorts behind all of them.
  const lastTrained = (id: string) => {
    const position = recent.indexOf(id)
    return position === -1 ? Infinity : position
  }
  const available = options
    .filter(
      (exercise) =>
        isDistanceTimeExercise(exercise) &&
        (!query || [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query)),
    )
    .sort((a, b) => lastTrained(a.id) - lastTrained(b.id))

  return (
    <AppSheet
      body={summary}
      title={t('record.chooseTitle')}
      closeLabel={t('workout.closeExercisePicker')}
      onClose={onClose}
    >
      <AppSearchField
        className="mb-4"
        label={t('exercise.search')}
        value={search}
        onChange={setSearch}
      />

      {loading && !loaded ? (
        <AppSkeleton />
      ) : failed && !options.length ? (
        <AppErrorState onRetry={() => void fetchPage()} />
      ) : available.length ? (
        <div className={styles.options}>
          {available.map((exercise) => (
            <AppOptionRow
              key={exercise.id}
              flat
              selected={selected?.id === exercise.id}
              trailing={
                recent.includes(exercise.id) ? (
                  <span className={styles.recent}>{t('record.recent')}</span>
                ) : undefined
              }
              onClick={() => setSelected(exercise)}
            >
              <strong>{exercise.name}</strong>
            </AppOptionRow>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p>{search ? t('workout.noExerciseMatches') : t('record.emptyLibrary')}</p>
          {!search && (
            <AppButton type="link" colour="primary" width="auto" to="/exercises/create">
              {t('exercise.create')}
            </AppButton>
          )}
        </div>
      )}

      {hasMorePages && !failed && (
        <AppLoadMore
          label={loading ? t('common.loading') : t('exercise.loadMore')}
          loading={loading}
          onFetch={() => {
            setLoading(true)
            void fetchPage().finally(() => setLoading(false))
          }}
        />
      )}

      <AppButton
        className="mt-4"
        type="button"
        colour="primary"
        size="lg"
        disabled={!selected || saving}
        onClick={() => selected && onSave(selected)}
      >
        {selected ? t('record.saveAs', { name: selected.name }) : t('common.save')}
      </AppButton>
    </AppSheet>
  )
}
