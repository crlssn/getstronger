import type { Workout, WorkoutComment } from '@/proto/api/v1/workout_service_pb'
import type { DropdownItem } from '@/types/dropdown'
import type { ReactNode } from 'react'

import {
  CalendarDaysIcon,
  ClockIcon,
  FireIcon,
  RectangleStackIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { deleteWorkout, postWorkoutComment } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { cn } from '@/ui/cn'
import { CardWorkoutComment } from '@/ui/components/CardWorkoutComment'
import { CardWorkoutExercise } from '@/ui/components/CardWorkoutExercise'
import { DropdownButton } from '@/ui/components/DropdownButton'
import { autosize } from '@/utils/autosize'
import { handle, initials } from '@/utils/names'
import { formatNumber } from '@/utils/numbers'
import { workoutSummary } from '@/utils/workoutSummary'
import styles from './CardWorkout.module.css'

const maxCommentLength = 500

interface Props {
  workout: Workout
  /** The feed card: one tappable summary rather than the full session. */
  compact: boolean
}

/**
 * A finished workout, as a feed summary or as the full session.
 *
 * The two share their author row, their headline metrics and their note; what
 * differs is that the compact card is a single link to the workout, and the
 * full one adds the exercises and the comments.
 */
export const CardWorkout = ({ workout, compact }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuthStore((state) => state.userId)

  const [deleted, setDeleted] = useState(false)
  const [comments, setComments] = useState<WorkoutComment[]>(() => [...workout.comments])
  const [commentInput, setCommentInput] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const { setCount, personalBestCount, durationMinutes, finishedDate } = workoutSummary(workout)
  const isOwner = workout.user?.id === userId

  const onDeleteWorkout = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('workout.card.deleteConfirmBody'),
      confirmLabel: t('workout.card.deleteWorkout'),
      destructive: true,
      title: t('workout.card.deleteConfirmTitle', { name: workout.name }),
    })
    if (!confirmed) return

    const response = await deleteWorkout(workout.id)
    if (!response) return

    // The feed card stays put, but the full view navigates home, so its alert
    // must survive that one route change.
    const alerts = useAlertStore.getState()
    if (compact) alerts.setSuccessWithoutPageRefresh(t('workout.card.deleted'))
    else alerts.setSuccess(t('workout.card.deleted'))

    setDeleted(true)
    if (!compact) await navigate('/home')
  }

  const dropdownItems: DropdownItem[] = [
    { href: `/workouts/${workout.id}/edit`, title: t('workout.card.editWorkout') },
    { func: onDeleteWorkout, title: t('workout.card.deleteWorkout') },
  ]

  const postComment = async (event: React.FormEvent) => {
    event.preventDefault()
    const comment = commentInput.trim()
    if (!comment || postingComment) return

    setPostingComment(true)
    try {
      const response = await postWorkoutComment(workout.id, comment)
      if (!response?.comment) return

      setComments((current) => [...current, response.comment as WorkoutComment])
      setCommentInput('')
    } finally {
      setPostingComment(false)
    }
  }

  if (deleted) return null

  const authorRow = (
    <header className={cn(styles.authorRow, compact && styles.feedCardControl)}>
      <Link to={`/users/${workout.user?.id}`} className={styles.avatar}>
        {/* The brand's own initials stand in for a name we were not given. */}
        {initials(workout.user?.name) || 'GS'}
      </Link>
      <div className={styles.authorCopy}>
        <Link to={`/users/${workout.user?.id}`}>{handle(workout.user?.username)}</Link>
        <p>
          <span className="truncate">{workout.user?.name}</span>
          <span aria-hidden="true">·</span>
          <CalendarDaysIcon aria-hidden="true" /> {finishedDate}
        </p>
      </div>
      {isOwner && <DropdownButton items={dropdownItems} />}
    </header>
  )

  const personalBestBadge = personalBestCount > 0 && (
    <span className={styles.personalBestBadge}>
      <TrophyIcon aria-hidden="true" />
      {t('workout.card.prBadge', { count: personalBestCount })}
    </span>
  )

  const metric = (icon: ReactNode, label: string, value: string, amber = false) => (
    <article>
      <span className={cn(styles.metricIcon, amber && styles.amber)}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  )

  const metricGrid = (
    <div className={styles.metricGrid}>
      {metric(
        <FireIcon aria-hidden="true" />,
        t('workout.totalVolume'),
        `${formatNumber(workout.intensity)} ${t('common.kg')}`,
      )}
      {metric(
        <ClockIcon aria-hidden="true" />,
        t('common.duration'),
        `${durationMinutes} ${t('common.min')}`,
      )}
      {metric(<RectangleStackIcon aria-hidden="true" />, t('workout.setsLogged'), `${setCount}`)}
      {metric(
        <TrophyIcon aria-hidden="true" />,
        t('workout.personalRecords'),
        `${personalBestCount}`,
        personalBestCount > 0,
      )}
    </div>
  )

  const note = workout.note && (
    <div className={cn(styles.summaryNote, compact && styles.summaryNoteCompact)}>
      <p className={styles.eyebrow}>{t('workout.note')}</p>
      <p>{workout.note}</p>
    </div>
  )

  if (compact) {
    return (
      <article
        className={cn(
          styles.summaryCard,
          styles.feedSummaryCard,
          personalBestCount > 0 && styles.hasPersonalBest,
        )}
      >
        <Link
          to={`/workouts/${workout.id}`}
          className={styles.feedCardLink}
          aria-label={t('workout.card.viewDetails', { name: workout.name })}
        />

        {authorRow}

        <div className={styles.workoutHeading}>
          <div className={styles.workoutHeadingCopy}>
            <div>
              <p className={styles.eyebrow}>{t('workout.completed')}</p>
              <h2>{workout.name}</h2>
            </div>
            {personalBestBadge}
          </div>
        </div>

        {metricGrid}
        {note}
      </article>
    )
  }

  // Only the owner sees an empty comments section; for everyone else it is the
  // way to say something, so it is always there.
  const showComments = !isOwner || comments.length > 0

  return (
    <div className={styles.workoutDetail}>
      <section
        className={cn(
          styles.summaryCard,
          styles.detailSummaryCard,
          personalBestCount > 0 && styles.hasPersonalBest,
        )}
      >
        {authorRow}

        <div className={styles.workoutHeading}>
          <div className={styles.workoutHeadingCopy}>
            {/* The nav bar above already carries this workout's name. The
                eyebrow stays because it says what the title does not. */}
            <p className={styles.eyebrow}>{t('workout.completed')}</p>
            {personalBestBadge}
          </div>
        </div>

        {metricGrid}
        {note}
      </section>

      <section className={styles.detailSection}>
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>{t('workout.sessionDetails')}</p>
            <h2>{t('common.exercises')}</h2>
          </div>
          <span>{t('home.exerciseCount', { count: workout.exerciseSets.length })}</span>
        </header>
        <div className={styles.exerciseList}>
          {workout.exerciseSets.map((exerciseSet) => (
            <CardWorkoutExercise
              key={exerciseSet.exercise?.id}
              flat
              exerciseId={exerciseSet.exercise?.id}
              name={exerciseSet.exercise?.name}
              sets={exerciseSet.sets}
              tags={exerciseSet.exercise?.tags}
              metrics={exerciseSet.exercise?.metrics}
            />
          ))}
        </div>
      </section>

      {showComments && (
        <section className={styles.commentsCard}>
          <header className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{t('workout.card.community')}</p>
              <h2>{t('workout.card.comments')}</h2>
            </div>
            <span>{comments.length}</span>
          </header>

          {comments.length > 0 ? (
            <div className={styles.commentList}>
              {comments.map((comment) => (
                <CardWorkoutComment
                  key={comment.id}
                  user={comment.user}
                  timestamp={comment.createdAt}
                  comment={comment.comment}
                />
              ))}
            </div>
          ) : (
            <p className={styles.noComments}>{t('workout.card.noComments')}</p>
          )}

          <form className={styles.commentForm} onSubmit={(event) => void postComment(event)}>
            <label htmlFor="workout-comment">{t('workout.card.addComment')}</label>
            <textarea
              id="workout-comment"
              ref={autosize}
              maxLength={maxCommentLength}
              placeholder={t('workout.card.commentPlaceholder')}
              required
              value={commentInput}
              onChange={(event) => {
                setCommentInput(event.target.value)
                autosize(event.target)
              }}
            />
            <div>
              <small>
                {commentInput.trim().length}/{maxCommentLength}
              </small>
              <button type="submit" disabled={!commentInput.trim() || postingComment}>
                {postingComment ? t('workout.card.posting') : t('workout.card.postComment')}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
