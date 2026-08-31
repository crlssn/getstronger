import type { CarouselSlide } from '@/ui/components/AppCarousel'
import type { Plan, Routine } from '@/proto/api/v1/routine_service_pb'

import { PlayIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppCarousel } from '@/ui/components/AppCarousel'
import { estimatedSessionMinutes } from '@/utils/sessionEstimate'
import styles from './RoutineCarousel.module.css'

/** How many routines the row holds before the rest go behind the picker. */
const maxPanels = 5

interface Props {
  /** What the dashboard says is up next; it leads the row. */
  nextRoutine: Routine
  /** Every routine the athlete has, in the order the dashboard returned them. */
  routines: readonly Routine[]
  /** The plan deciding the order, when one is running. */
  activePlan?: Plan
  /** The athlete swiped to another routine and started it. */
  onSwitch: (routineId: string) => void
  /** More routines exist than the row holds, and one of them was asked for. */
  onShowAll: () => void
}

/**
 * The routines that could be trained next, one card at a time.
 *
 * What is up next leads, and whatever could be trained instead sits behind it:
 * switching is a swipe and a tap rather than a sheet, and starting an
 * alternative is what makes it the next session. A plan already decides that
 * order, so under one the row holds the planned routine alone.
 */
export const RoutineCarousel = ({
  nextRoutine,
  routines,
  activePlan,
  onSwitch,
  onShowAll,
}: Props) => {
  const { t } = useTranslation()

  // A plan decides what comes next, so a swipe that changed it would be
  // arguing with the plan.
  const alternatives = activePlan ? [] : routines.filter(({ id }) => id !== nextRoutine.id)
  const shown = alternatives.slice(0, maxPanels - 1)

  const meta = (routine: Routine, plan?: Plan) =>
    [
      plan?.name,
      t('home.exerciseCount', { count: routine.exercises.length }),
      t('home.aboutMinutes', { count: estimatedSessionMinutes(routine.exercises.length) }),
    ]
      .filter(Boolean)
      .join(' · ')

  const panel = (routine: Routine, planned: boolean): CarouselSlide => ({
    key: routine.id,
    label: routine.name,
    content: (
      <Link
        aria-label={t('home.startNamedRoutine', { name: routine.name })}
        className={cn(styles.card, !planned && styles.alternative)}
        to={`/workouts/routine/${routine.id}${planned && activePlan ? `?plan_id=${activePlan.id}` : ''}`}
        onClick={() => !planned && onSwitch(routine.id)}
      >
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            {planned ? t('home.upNext') : t('home.orSwitchTo')}
            {planned && activePlan && (
              <>
                <span aria-hidden="true"> · </span>
                {activePlan.currentPosition + 1} {t('common.of')} {activePlan.routines.length}
              </>
            )}
          </p>
          <h2>{routine.name}</h2>
          {/* What it is, how much of it, how long: one line, where three lines
              spread the card down the screen. */}
          <p className={styles.meta}>{meta(routine, planned ? activePlan : undefined)}</p>
        </div>
        <span aria-hidden="true" className={styles.play}>
          <PlayIcon />
        </span>
      </Link>
    ),
  })

  return (
    <div className={styles.routineRow}>
      <AppCarousel
        label={t('home.routineRow')}
        slides={[panel(nextRoutine, true), ...shown.map((routine) => panel(routine, false))]}
      />

      {/* Swiping through twenty routines is not choosing between them, so past
          what the row holds the picker takes over. */}
      {alternatives.length > shown.length && (
        <AppButton type="button" colour="ghost" size="sm" onClick={onShowAll}>
          {t('home.chooseRoutine')}
        </AppButton>
      )}
    </div>
  )
}
