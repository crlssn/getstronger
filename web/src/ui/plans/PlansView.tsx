import { CheckIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { selectActivePlan, usePlanStore } from '@/stores/plans'
import { cn } from '@/ui/cn'
import { consumeRequestError } from '@/http/requests'
import { AppButton } from '@/ui/components/AppButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { TrainingTabs } from '@/ui/features/TrainingTabs'
import styles from './PlansView.module.css'

/** Every plan: which one is running, where it is, and what else is available. */
export const PlansView = () => {
  const { t } = useTranslation()

  const plans = usePlanStore((state) => state.plans)
  const activePlan = usePlanStore(selectActivePlan)
  const failed = usePlanStore((state) => state.failed)

  const [loaded, setLoaded] = useState(false)
  const [actionError, setActionError] = useState<string>()

  const load = useCallback(() => usePlanStore.getState().load(), [])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
      setLoaded(true)
    }
    void initialLoad()
  }, [load])

  const otherPlans = plans.filter((plan) => !plan.active)
  const nextRoutine = activePlan?.routines[activePlan.currentPosition]

  // Only one plan runs at a time, so activating another one ends the first.
  const activate = async (id: string) => {
    if (activePlan) {
      const confirmed = await useConfirmationStore.getState().confirm({
        body: t('training.activateConfirmBody'),
        confirmLabel: t('training.makeActive'),
        title: t('training.activateConfirmTitle'),
      })
      if (!confirmed) return
    }

    setActionError(undefined)
    if (await usePlanStore.getState().activate(id)) {
      await useDashboardStore.getState().load()
      return
    }
    setActionError(consumeRequestError() ?? t('common.somethingWentWrong'))
  }

  const pause = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('training.pauseConfirmBody'),
      confirmLabel: t('training.pause'),
      title: t('training.pauseConfirmTitle'),
    })
    if (!confirmed) return

    setActionError(undefined)
    if (await usePlanStore.getState().pause()) {
      await useDashboardStore.getState().load()
      return
    }
    setActionError(consumeRequestError() ?? t('common.somethingWentWrong'))
  }

  return (
    <div className={styles.plansPage}>
      {actionError && <AppInlineError>{actionError}</AppInlineError>}
      <AppPageHeader
        action={
          plans.length > 0 && (
            <AppButton type="link" colour="primary" width="auto" to="/plans/create">
              <PlusIcon className="size-5" aria-hidden="true" /> {t('training.newPlan')}
            </AppButton>
          )
        }
        lead={t('training.plansDescription')}
        title={t('training.heading')}
      />

      <TrainingTabs />

      {!loaded ? (
        <AppSkeleton />
      ) : failed && plans.length === 0 ? (
        // The empty state below teaches what a plan is, which is the wrong
        // lesson for someone who already has three of them.
        <AppErrorState onRetry={() => void load()} />
      ) : plans.length === 0 ? (
        // One shape, under 160px. The three-step tour of what a plan is spent
        // an entire 844px and pushed its own button off the bottom of the
        // screen; it lives behind the link now, read once rather than paid for
        // on every visit.
        <AppEmptyState
          action={{ label: t('training.createFirstPlan'), to: '/plans/create' }}
          actionIcon={<PlusIcon aria-hidden="true" />}
          body={t('training.noPlansBody')}
          title={t('training.noPlansTitle')}
          learnMore={{
            label: t('training.howPlansWork'),
            title: t('training.repeatingTitle'),
            children: (
              <div className={styles.planExplainer}>
                <p>{t('training.repeatingBody')}</p>

                <ol className={styles.planSteps}>
                  <li>
                    <span>1</span>
                    <div>
                      <strong>{t('training.chooseRoutines')}</strong>
                      <small>{t('training.chooseRoutinesBody')}</small>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>{t('training.activatePlan')}</strong>
                      <small>{t('training.activatePlanBody')}</small>
                    </div>
                  </li>
                  <li>
                    <span>
                      <CheckIcon aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{t('training.keepTraining')}</strong>
                      <small>{t('training.keepTrainingBody')}</small>
                    </div>
                  </li>
                </ol>

                <p className={styles.activePlanRule}>{t('training.oneActive')}</p>
              </div>
            ),
          }}
        />
      ) : (
        <>
          {activePlan ? (
            <section className={styles.activePlan}>
              <header>
                <span>{t('training.active')}</span>
              </header>
              <h2>{activePlan.name}</h2>
              <p>{t('training.routineCountRepeats', { count: activePlan.routines.length })}</p>

              <div className={styles.positionRow}>
                <span>{t('training.currentPosition')}</span>
                <strong>
                  {t('training.routinePosition', {
                    current: activePlan.currentPosition + 1,
                    total: activePlan.routines.length,
                  })}
                </strong>
              </div>

              <div className={styles.sequence} aria-label={t('training.planPositionAria')}>
                {activePlan.routines.map((routine, index) => (
                  <span
                    key={routine.id}
                    className={cn(
                      index === activePlan.currentPosition && styles.current,
                      index < activePlan.currentPosition && styles.done,
                    )}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>

              {nextRoutine && (
                <div className={styles.nextRow}>
                  <div>
                    <small>{t('home.upNext')}</small>
                    <strong>{nextRoutine.name}</strong>
                    <small>
                      {t('home.exerciseCount', { count: nextRoutine.exercises.length })}
                    </small>
                  </div>
                </div>
              )}

              <footer>
                <AppButton
                  type="link"
                  colour="primary"
                  size="sm"
                  width="auto"
                  to={`/plans/${activePlan.id}`}
                >
                  {t('training.viewPlan')}
                </AppButton>
                <AppButton
                  type="button"
                  colour="secondary"
                  size="sm"
                  width="auto"
                  onClick={() => void pause()}
                >
                  {t('training.pause')}
                </AppButton>
              </footer>
            </section>
          ) : (
            <section className={styles.pausedNote}>
              <h2>{t('training.noActivePlan')}</h2>
              <p>{t('training.noActivePlanBody')}</p>
            </section>
          )}

          {otherPlans.length > 0 && (
            <section className={styles.otherPlans}>
              <header>
                <h2>{activePlan ? t('training.otherPlans') : t('training.choosePlan')}</h2>
              </header>
              {otherPlans.map((plan) => (
                <article key={plan.id}>
                  <Link to={`/plans/${plan.id}`}>
                    <strong>{plan.name}</strong>
                    <small>
                      {t('training.routineCountSequence', { count: plan.routines.length })}
                    </small>
                  </Link>
                  <AppButton
                    type="button"
                    colour="ghost"
                    size="sm"
                    width="auto"
                    className={styles.makeActive}
                    onClick={() => void activate(plan.id)}
                  >
                    {t('training.makeActive')}
                  </AppButton>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
