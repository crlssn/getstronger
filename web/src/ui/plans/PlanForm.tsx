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
import { useAlertStore } from '@/stores/alerts'
import { usePlanStore } from '@/stores/plans'
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

  const [name, setName] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [selected, setSelected] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const editing = Boolean(planId)

  useEffect(() => {
    const load = async () => {
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

  const canSave = name.trim().length > 0 && selected.length > 0

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
    useAlertStore
      .getState()
      .setSuccess(editing ? t('training.planForm.updated') : t('training.planForm.created'))
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
            <label className={styles.nameField}>
              <span>{t('training.planForm.name')}</span>
              <input
                type="text"
                placeholder={t('training.planForm.namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

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
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={t('training.planForm.moveUp', { name: routine.name })}
                          onClick={() => moveRoutine(index, -1)}
                        >
                          <ArrowUpIcon aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={index === selected.length - 1}
                          aria-label={t('training.planForm.moveDown', { name: routine.name })}
                          onClick={() => moveRoutine(index, 1)}
                        >
                          <ArrowDownIcon aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('training.planForm.remove', { name: routine.name })}
                          onClick={() =>
                            setSelected((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                        >
                          <TrashIcon aria-hidden="true" />
                        </button>
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

            <div className={styles.saveArea}>
              <small>
                {editing
                  ? t('training.planForm.saveNoteEditing')
                  : t('training.planForm.saveNoteNew')}
              </small>
              <button type="submit" disabled={!canSave || saving}>
                {saving
                  ? t('training.planForm.saving')
                  : editing
                    ? t('training.planForm.saveChanges')
                    : t('training.planForm.createPlan')}
              </button>
            </div>
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
              {available.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => {
                    setSelected((current) => [...current, routine])
                    setPickerOpen(false)
                  }}
                >
                  <span>
                    <strong>{routine.name}</strong>
                    <small>{t('home.exerciseCount', { count: routine.exercises.length })}</small>
                  </span>
                  <PlusIcon aria-hidden="true" />
                </button>
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
