import type { Routine } from '@/proto/api/v1/routine_service_pb'

import {
  ArrowDownIcon,
  ArrowsUpDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { getPlan, listRoutines } from '@/http/requests'
import posthog from '@/posthog'
import { lastPerformedIn, useActivityStore } from '@/stores/activity'
import { usePlanStore } from '@/stores/plans'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppFormFooter } from '@/ui/components/AppFormFooter'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppInput } from '@/ui/components/AppInput'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import styles from './PlanForm.module.css'

interface Props {
  /** Present when editing; absent when building a new plan. */
  planId?: string
}

/** Builds the loop of routines a plan runs through, in the order it runs them. */
export const PlanForm = ({ planId }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const routineLastPerformed = useActivityStore((state) => state.routineLastPerformed)

  const [name, setName] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [selected, setSelected] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const editing = Boolean(planId)

  useEffect(() => {
    const load = async () => {
      // The picker says when each routine was last trained, which is what tells
      // three routines with the same name and exercise count apart.
      void useActivityStore.getState().load()

      const routinesResponse = await listRoutines(new Uint8Array(0))
      setRoutines(routinesResponse?.routines ?? [])

      if (planId) {
        const response = await getPlan(planId)
        if (!response?.plan) {
          await navigate('/plans', { replace: true })
          return
        }
        setName(response.plan.name)
        setSelected([...response.plan.routines])
      }
      setLoading(false)
    }
    void load()
  }, [planId, navigate])

  // A routine appears once in a plan, so the picker only offers what is left.
  const selectedIds = new Set(selected.map((routine) => routine.id))
  const available = routines.filter((routine) => !selectedIds.has(routine.id))

  const needsName = name.trim().length === 0
  const needsRoutine = selected.length === 0
  const canSave = !needsName && !needsRoutine

  // Read off the same two conditions the submit is, so the line can never name
  // a requirement the button is not actually waiting for.
  const missing = needsName
    ? needsRoutine
      ? t('training.planForm.needsNameAndRoutine')
      : t('training.planForm.needsName')
    : needsRoutine
      ? t('training.planForm.needsRoutine')
      : undefined

  const moveRoutine = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= selected.length) return

    const next = [...selected]
    const [routine] = next.splice(index, 1)
    if (routine) next.splice(target, 0, routine)
    setSelected(next)
  }

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)

    const routineIds = selected.map((routine) => routine.id)
    const store = usePlanStore.getState()
    const plan = planId
      ? await store.update(planId, name.trim(), routineIds)
      : await store.create(name.trim(), routineIds)

    setSaving(false)
    if (!plan) return

    posthog.capture(editing ? 'plan_updated' : 'plan_created')
    useToastStore
      .getState()
      .success(editing ? t('training.planForm.updated') : t('training.planForm.created'))
    await navigate(`/plans/${plan.id}`)
  }

  return (
    <>
      <form
        className={styles.builderPage}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className={styles.pageIntro}>
          <p className={styles.eyebrow}>{t('training.planForm.eyebrow')}</p>
          <p>{t('training.planForm.intro')}</p>
        </header>

        {loading ? (
          <AppSkeleton />
        ) : (
          <>
            <AppInput
              className={styles.nameField}
              label={t('training.planForm.name')}
              placeholder={t('training.planForm.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <div className={styles.loopNote}>
              <ArrowsUpDownIcon aria-hidden="true" />
              <span>{t('training.planForm.loopNote')}</span>
            </div>
            {editing && <div className={styles.editNote}>{t('training.planForm.editNote')}</div>}

            <section className={styles.routineOrder}>
              <header>
                <div>
                  <p className={styles.eyebrow}>{t('training.planForm.orderEyebrow')}</p>
                  <h2>{t('common.routines')}</h2>
                </div>
                <span>{t('training.planForm.routineCount', { count: selected.length })}</span>
              </header>

              {selected.length === 0 ? (
                <div className={styles.emptyOrder}>
                  <strong>{t('training.planForm.emptyTitle')}</strong>
                  <p>{t('training.planForm.emptyBody')}</p>
                </div>
              ) : (
                <ol>
                  {selected.map((routine, index) => (
                    <li key={routine.id}>
                      <span className={styles.position}>{index + 1}</span>
                      <div className={styles.routineCopy}>
                        <strong>{routine.name}</strong>
                        <small>
                          {t('home.exerciseCount', { count: routine.exercises.length })}
                        </small>
                      </div>
                      <div className={styles.orderActions}>
                        <AppIconButton
                          icon={ArrowUpIcon}
                          disabled={index === 0}
                          label={t('training.planForm.moveUp', { name: routine.name })}
                          onClick={() => moveRoutine(index, -1)}
                        />
                        <AppIconButton
                          icon={ArrowDownIcon}
                          disabled={index === selected.length - 1}
                          label={t('training.planForm.moveDown', { name: routine.name })}
                          onClick={() => moveRoutine(index, 1)}
                        />
                        <AppIconButton
                          icon={TrashIcon}
                          tone="danger"
                          label={t('training.planForm.remove', { name: routine.name })}
                          onClick={() =>
                            setSelected((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <div className={styles.addRoutine}>
                <AppOptionalAction
                  label={t('training.planForm.addRoutine')}
                  onClick={() => setPickerOpen(true)}
                />
              </div>

              {/* The loop is the point of a plan, so the wrap-around is spelled
                  out rather than left to be inferred from the order. */}
              {selected.length > 0 && (
                <footer>
                  {t('training.planForm.loopFooter', {
                    last: selected[selected.length - 1]?.name,
                    first: selected[0]?.name,
                  })}
                </footer>
              )}
            </section>

            <p className={styles.saveNote}>
              {editing
                ? t('training.planForm.saveNoteEditing')
                : t('training.planForm.saveNoteNew')}
            </p>

            {/* Pinned rather than parked at the end of the scroll, where the
                tab bar sliced it in half. */}
            <AppFormFooter hint={missing}>
              <AppButton type="submit" colour="primary" size="lg" disabled={!canSave || saving}>
                {saving
                  ? t('training.planForm.saving')
                  : editing
                    ? t('training.planForm.saveChanges')
                    : t('training.planForm.createPlan')}
              </AppButton>
            </AppFormFooter>
          </>
        )}
      </form>

      {pickerOpen && (
        <AppSheet
          eyebrow={t('training.planForm.pickerEyebrow')}
          title={t('training.planForm.pickerTitle')}
          closeLabel={t('home.closePicker')}
          onClose={() => setPickerOpen(false)}
        >
          {available.length > 0 ? (
            <div className={styles.routineOptions}>
              {/* Three routines called Upper Body with the same "3 exercises"
                  subtitle are impossible to tell apart, so each says when it
                  was last trained. */}
              {available.map((routine) => (
                <AppOptionRow
                  key={routine.id}
                  flat
                  trailing={<PlusIcon aria-hidden="true" />}
                  onClick={() => {
                    setSelected((current) => [...current, routine])
                    setPickerOpen(false)
                  }}
                >
                  <strong>{routine.name}</strong>
                  <small>
                    {[
                      t('home.exerciseCount', { count: routine.exercises.length }),
                      lastPerformedIn(routineLastPerformed, routine.id)?.toRelative(),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </AppOptionRow>
              ))}
            </div>
          ) : (
            <p className={styles.pickerEmpty}>{t('training.planForm.pickerEmpty')}</p>
          )}
        </AppSheet>
      )}
    </>
  )
}
