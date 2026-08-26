import type { Workout, WorkoutComment } from '@/proto/api/v1/workout_service_pb'
import type { DropdownItem } from '@/types/dropdown'

import { CheckIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { deleteWorkout, postWorkoutComment } from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { AppButton } from '@/ui/components/AppButton'
import { AppTextarea } from '@/ui/components/AppTextarea'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { cn } from '@/ui/cn'
import { CardWorkoutComment } from '@/ui/features/CardWorkoutComment'
import { CardWorkoutExercise } from '@/ui/features/CardWorkoutExercise'
import { DropdownButton } from '@/ui/components/DropdownButton'
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
 * The two share their headline metrics and their note; what differs is that the
 * compact card is a single link to the workout and carries its author, while
 * the full one is read under the title the nav bar already shows, and adds the
 * exercises and the comments.
 */
export const CardWorkout = ({ workout, compact }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuthStore((state) => state.userId)

  const [deleted, setDeleted] = useState(false)
  const [comments, setComments] = useState<WorkoutComment[]>(() => [...workout.comments])
  const [commentInput, setCommentInput] = useState('')
  // One exercise open at a time: the list is there so the session reads as its
  // exercises, and two tables at once is what it was built to stop.
  const [openExercise, setOpenExercise] = useState(0)
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

    useToastStore.getState().success(t('workout.card.deleted'))

    setDeleted(true)
    if (!compact) await navigate('/home')
  }

  const dropdownItems: DropdownItem[] = [
    { href: `/workouts/${workout.id}/edit`, title: t('workout.card.editWorkout') },
    { destructive: true, func: onDeleteWorkout, title: t('workout.card.deleteWorkout') },
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

  const personalBestBadge = personalBestCount > 0 && (
    <span className={styles.personalBestBadge}>
      <TrophyIcon aria-hidden="true" />
      {t('workout.card.prBadge', { count: personalBestCount })}
    </span>
  )

  const metric = (label: string, value: string) => (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  )

  // Four numbers in a quadrant, and nothing else: each carried a grey icon tile
  // that repeated eight times down a feed screen without saying anything the
  // label beside it did not.
  const metricGrid = (
    <div className={styles.metricGrid}>
      {metric(t('workout.totalVolume'), `${formatNumber(workout.intensity)} ${t('common.kg')}`)}
      {metric(t('common.duration'), `${durationMinutes} ${t('common.min')}`)}
      {metric(t('workout.setsLogged'), `${setCount}`)}
      {metric(t('workout.personalRecords'), `${personalBestCount}`)}
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
      <article className={cn(styles.summaryCard, styles.feedSummaryCard)}>
        <Link
          to={`/workouts/${workout.id}`}
          className={styles.feedCardLink}
          aria-label={t('workout.card.viewDetails', { name: workout.name })}
        />

        {/* The account, and when it trained. The person's own name competed
            with the handle for one row and said the same thing twice; it is on
            the profile the handle links to. */}
        <header className={cn(styles.authorRow, styles.feedCardControl)}>
          <Link to={`/users/${workout.user?.id}`} className={styles.avatar}>
            {/* The brand's own initials stand in for a name we were not given. */}
            {initials(workout.user?.name) || 'GS'}
          </Link>
          <div className={styles.authorCopy}>
            <p className={styles.authorNames}>
              <Link to={`/users/${workout.user?.id}`}>{handle(workout.user?.username)}</Link>
            </p>
            <p className={styles.authorDate}>{finishedDate}</p>
          </div>
          {isOwner && <DropdownButton items={dropdownItems} />}
        </header>

        <div className={cn(styles.completedBand, personalBestCount > 0 && styles.record)}>
          <div>
            <p className={styles.eyebrow}>{t('workout.completed')}</p>
            <h2>{workout.name}</h2>
          </div>
          {personalBestBadge}
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
      {isOwner && (
        <PageNavAction>
          <DropdownButton items={dropdownItems} />
        </PageNavAction>
      )}

      {/* The nav bar above carries the title, so the author is a byline under
          it rather than a card between the title and the numbers. */}
      <p className={styles.byline}>
        <Link to={`/users/${workout.user?.id}`}>{handle(workout.user?.username)}</Link>
        <span aria-hidden="true">·</span>
        {finishedDate}
      </p>

      <section className={cn(styles.summaryCard, styles.detailSummaryCard)}>
        <div className={cn(styles.completedBand, personalBestCount > 0 && styles.record)}>
          <p className={styles.completedLabel}>
            <span className={styles.completedMark}>
              <CheckIcon aria-hidden="true" />
            </span>
            {t('workout.completed')}
          </p>
          {personalBestBadge}
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
          {workout.exerciseSets.map((exerciseSet, index) => (
            <CardWorkoutExercise
              key={exerciseSet.exercise?.id}
              open={openExercise === index}
              onToggle={() => setOpenExercise((current) => (current === index ? -1 : index))}
              exerciseId={exerciseSet.exercise?.id}
              name={exerciseSet.exercise?.name}
              sets={exerciseSet.sets}
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
            <AppTextarea
              autosize
              id="workout-comment"
              maxLength={maxCommentLength}
              placeholder={t('workout.card.commentPlaceholder')}
              required
              rows={2}
              value={commentInput}
              onChange={(event) => setCommentInput(event.target.value)}
            />
            <div>
              <small>
                {commentInput.trim().length}/{maxCommentLength}
              </small>
              <AppButton
                type="submit"
                colour="primary"
                size="sm"
                width="auto"
                disabled={!commentInput.trim() || postingComment}
              >
                {postingComment ? t('workout.card.posting') : t('workout.card.postComment')}
              </AppButton>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
