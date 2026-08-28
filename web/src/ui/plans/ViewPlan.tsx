import type { Plan } from '@/proto/api/v1/routine_service_pb'

import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getPlan } from '@/http/requests'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { usePlanStore } from '@/stores/plans'
import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
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
          <AppButton type="link" colour="primary" width="auto" to={`/plans/${plan.id}/edit`}>
            <PencilIcon className="size-5" aria-hidden="true" /> {t('training.planForm.editTitle')}
          </AppButton>
          {plan.active ? (
            <AppButton type="button" colour="secondary" width="auto" onClick={() => void pause()}>
              {t('training.pause')}
            </AppButton>
          ) : (
            <AppButton
              type="button"
              colour="secondary"
              width="auto"
              onClick={() => void activate()}
            >
              {t('training.makeActive')}
            </AppButton>
          )}
        </div>
      </section>

      <header className={styles.orderHeading}>
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

      <AppButton
        type="button"
        colour="destructive"
        className={styles.deletePlan}
        onClick={() => void remove()}
      >
        <TrashIcon className="size-5" aria-hidden="true" /> {t('training.planView.delete')}
      </AppButton>
    </div>
  )
}
