import type { Plan } from '@/proto/api/v1/routine_service_pb'

import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getPlan } from '@/http/requests'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { usePlanStore } from '@/stores/plans'
import { cn } from '@/ui/cn'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import styles from './ViewPlan.module.css'

/** One plan: the loop of routines it runs, and where in the loop it is. */
export const ViewPlan = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const [plan, setPlan] = useState<Plan>()

  useEffect(() => {
    const load = async () => {
      const response = await getPlan(id)
      if (!response?.plan) {
        await navigate('/plans', { replace: true })
        return
      }
      setPlan(response.plan)
      usePageTitleStore.getState().setPageTitle(response.plan.name)
    }
    void load()
  }, [id, navigate])

  const activate = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('training.activateConfirmBody'),
      confirmLabel: t('training.makeActive'),
      title: t('training.activateConfirmTitle'),
    })
    if (!confirmed) return

    const updated = await usePlanStore.getState().activate(id)
    if (!updated) return

    setPlan(updated)
    await useDashboardStore.getState().load()
  }

  const pause = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('training.pauseConfirmBody'),
      confirmLabel: t('training.pause'),
      title: t('training.pauseConfirmTitle'),
    })
    if (!confirmed) return

    if (!(await usePlanStore.getState().pause())) return

    setPlan((current) => (current ? { ...current, active: false } : current))
    await useDashboardStore.getState().load()
  }

  const remove = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('training.planView.deleteConfirmBody'),
      confirmLabel: t('training.planView.delete'),
      destructive: true,
      title: t('training.planView.deleteConfirmTitle'),
    })
    if (!confirmed) return

    if (await usePlanStore.getState().remove(id)) await navigate('/plans')
  }

  if (!plan) return <AppSkeleton />

  const isCurrent = (index: number) => plan.active && index === plan.currentPosition

  return (
    <div className={styles.planPage}>
      <section className={styles.overview}>
        <header>
          <p className={styles.eyebrow}>
            {plan.active ? t('training.activePlan') : t('training.planView.trainingPlan')}
          </p>
          {plan.active && <span>{t('training.active')}</span>}
        </header>
        <p>{t('training.planView.routinesRepeat', { count: plan.routines.length })}</p>
        <div className={styles.overviewActions}>
          <Link to={`/plans/${plan.id}/edit`}>
            <PencilIcon aria-hidden="true" /> {t('training.planForm.editTitle')}
          </Link>
          {plan.active ? (
            <button type="button" onClick={() => void pause()}>
              {t('training.pause')}
            </button>
          ) : (
            <button type="button" onClick={() => void activate()}>
              {t('training.makeActive')}
            </button>
          )}
        </div>
      </section>

      <header className={styles.orderHeading}>
        <p className={styles.eyebrow}>{t('training.planView.orderEyebrow')}</p>
        <h2>{t('training.planView.orderTitle')}</h2>
      </header>

      <section className={styles.routineOrder}>
        <ol>
          {plan.routines.map((routine, index) => (
            <li key={routine.id} className={cn(isCurrent(index) && styles.current)}>
              <span>{index + 1}</span>
              <div>
                <small>
                  {isCurrent(index)
                    ? t('training.planView.upNextTag')
                    : t('training.planView.routineTag', { number: index + 1 })}
                </small>
                <strong>{routine.name}</strong>
                <small>{t('home.exerciseCount', { count: routine.exercises.length })}</small>
              </div>
              {isCurrent(index) && <b>{t('common.next')}</b>}
            </li>
          ))}
        </ol>

        {/* The loop is the point of a plan, so the wrap-around is spelled out
            rather than left to be inferred from the order. */}
        <footer>
          {t('training.planForm.loopFooter', {
            last: plan.routines[plan.routines.length - 1]?.name,
            first: plan.routines[0]?.name,
          })}
        </footer>
      </section>

      <button type="button" className={styles.deletePlan} onClick={() => void remove()}>
        <TrashIcon aria-hidden="true" /> {t('training.planView.delete')}
      </button>
    </div>
  )
}
