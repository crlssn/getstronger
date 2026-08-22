import type { Exercise } from '@/proto/api/v1/shared_pb'

import { CheckIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExercises } from '@/http/requests'
import { AppButton } from '@/ui/components/AppButton'
import { AppInput } from '@/ui/components/AppInput'
import { AppLoadMore } from '@/ui/components/AppLoadMore'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './RoutineForm.module.css'

interface Props {
  submitLabel: string
  onSave: (name: string, exerciseIds: string[]) => void
  saving?: boolean
  initialName?: string
  initialExerciseIds?: string[]
}

/**
 * The fields a routine is made of, shared by creating one and editing one.
 *
 * The caller mounts it only once it has the routine to edit, so the initial
 * values are read once and owned here from then on.
 */
export const RoutineForm = ({
  submitLabel,
  onSave,
  saving = false,
  initialName = '',
  initialExerciseIds,
}: Props) => {
  const { t } = useTranslation()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const [name, setName] = useState(initialName)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => initialExerciseIds ?? [])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchExercises = useCallback(async () => {
    const response = await listExercises(currentPageToken())
    if (!response) return

    setExercises((current) => appendPage(current, response.exercises))
    setFromResponse(response.pagination)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await fetchExercises()
      setLoading(false)
    }
    void load()
  }, [fetchExercises])

  const query = search.trim().toLowerCase()
  const filtered = query
    ? exercises.filter((exercise) =>
        [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query),
      )
    : exercises

  // A routine with no name or no exercises is not a routine yet.
  const canSubmit = name.trim().length > 0 && selectedIds.length > 0 && !saving

  const toggleExercise = (exerciseId: string) =>
    setSelectedIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId],
    )

  return (
    <form
      className={styles.routineForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSave(name.trim(), selectedIds)
      }}
    >
      <header className={styles.formIntro}>
        <div>
          <p className={styles.eyebrow}>{t('routine.form.eyebrow')}</p>
          <p>{t('routine.form.intro')}</p>
        </div>
        <span className={styles.selectionCount}>
          {t('routine.form.selectedCount', { count: selectedIds.length })}
        </span>
      </header>

      <section className={styles.formCard}>
        <AppInput
          id="routine-name"
          type="text"
          label={t('routine.form.name')}
          required
          autoComplete="off"
          placeholder={t('routine.form.namePlaceholder')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </section>

      <section className={styles.exerciseCard}>
        <div className={styles.exerciseToolbar}>
          <div>
            <h2>{t('common.exercises')}</h2>
            <p>{t('routine.form.selectHelp')}</p>
          </div>
          <AppSearchField
            className={styles.searchField}
            label={t('exercise.search')}
            value={search}
            onChange={setSearch}
          />
        </div>

        {loading ? (
          <AppSkeleton />
        ) : filtered.length > 0 ? (
          <div className={styles.exerciseGrid}>
            {filtered.map((exercise) => {
              const selected = selectedIds.includes(exercise.id)

              return (
                <AppOptionRow
                  key={exercise.id}
                  leading={
                    <span className={styles.checkBox}>
                      {selected && <CheckIcon aria-hidden="true" />}
                    </span>
                  }
                  selected={selected}
                  onClick={() => toggleExercise(exercise.id)}
                >
                  <strong>{exercise.name}</strong>
                  <ExerciseTags compact tags={exercise.tags} />
                </AppOptionRow>
              )
            })}
          </div>
        ) : (
          <div className={styles.emptyRow}>
            {search ? t('workout.noExerciseMatches') : t('routine.form.createFirst')}
          </div>
        )}

        {hasMorePages && (
          <AppLoadMore label={t('exercise.loadMore')} onFetch={() => void fetchExercises()} />
        )}
      </section>

      <div className={styles.formActions}>
        <AppButton type="link" colour="ghost" width="auto" to="/routines">
          {t('common.cancel')}
        </AppButton>
        <AppButton type="submit" colour="primary" width="auto" disabled={!canSubmit}>
          {saving ? t('training.planForm.saving') : submitLabel}
        </AppButton>
      </div>
    </form>
  )
}
