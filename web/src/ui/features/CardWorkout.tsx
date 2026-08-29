import type { Workout, WorkoutComment, WorkoutGroup } from '@/proto/api/v1/workout_service_pb'
import type { DropdownItem } from '@/types/dropdown'

import { CheckIcon, ChevronRightIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { consumeRequestError, deleteWorkout, postWorkoutComment } from '@/http/requests'
import { DistanceUnit, RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { AppChip } from '@/ui/components/AppChip'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppButton } from '@/ui/components/AppButton'
import { AppTextarea } from '@/ui/components/AppTextarea'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { cn } from '@/ui/cn'
import { CardWorkoutCircuit } from '@/ui/features/CardWorkoutCircuit'
import { CardWorkoutComment } from '@/ui/features/CardWorkoutComment'
import { CardWorkoutExercise } from '@/ui/features/CardWorkoutExercise'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { DropdownButton } from '@/ui/components/DropdownButton'
import { handle, initials } from '@/utils/names'
import { convertDistance, distanceUnitLabel } from '@/utils/distanceUnits'
import { formatDurationDisplay } from '@/utils/exerciseMeasurements'
import { formatNumber } from '@/utils/numbers'
import { usePreferencesStore } from '@/stores/preferences'
import { groupLetter } from '@/utils/routineGroups'
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
  const [commentError, setCommentError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  // One exercise open at a time: the list is there so the session reads as its
  // exercises, and two tables at once is what it was built to stop. Keyed
  // rather than indexed, because a grouped session may train one exercise in
  // two blocks and each of them opens on its own.
  const [openExercise, setOpenExercise] = useState('0')
  const [postingComment, setPostingComment] = useState(false)
  const preferredDistanceUnit = usePreferencesStore((state) => state.distanceUnit)

  const {
    setCount,
    personalBestCount,
    durationMinutes,
    finishedDate,
    finishedMoment,
    totalReps,
    totalDistanceKm,
    totalSetSeconds,
  } = workoutSummary(workout)
  const isOwner = workout.user?.id === userId

  // One straight block is the plain session every workout used to be, so it is
  // shown as one rather than wearing a badge saying "Group A".
  const grouped =
    workout.groups.length > 1 ||
    workout.groups.some((group) => group.mode === RoutineGroupMode.CIRCUIT)

  // What the block was: how it ran, and — for a circuit — how many times round
  // it actually went, which is the session's answer rather than the routine's.
  const blockSummary = (group: WorkoutGroup) => {
    if (group.mode !== RoutineGroupMode.CIRCUIT) return t('routine.view.groupStraight')

    const rounds = Math.max(0, ...group.exercises.map((entry) => entry.sets.length))
    return [t('routine.view.groupCircuit'), t('routine.view.groupRounds', { count: rounds })].join(
      ' · ',
    )
  }

  const onDeleteWorkout = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('workout.card.deleteConfirmBody'),
      confirmLabel: t('workout.card.deleteWorkout'),
      destructive: true,
      title: t('workout.card.deleteConfirmTitle', { name: workout.name }),
    })
    if (!confirmed) return

    setActionError(undefined)
    const response = await deleteWorkout(workout.id)
    if (!response) {
      setActionError(consumeRequestError() ?? t('common.somethingWentWrong'))
      return
    }

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
    setCommentError(undefined)
    try {
      const response = await postWorkoutComment(workout.id, comment)
      if (!response?.comment) {
        setCommentError(consumeRequestError() ?? t('common.somethingWentWrong'))
        return
      }

      setComments((current) => [...current, response.comment as WorkoutComment])
      setCommentInput('')
    } finally {
      setPostingComment(false)
    }
  }

  if (deleted) return null

  const personalBestBadge = personalBestCount > 0 && (
    <AppChip tone="record">
      <TrophyIcon aria-hidden="true" />
      {t('workout.card.prBadge', { count: personalBestCount })}
    </AppChip>
  )

  const metric = (label: string, value: string) => (
    <li>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  )

  // The units the session actually trained in, then the session's own
  // numbers, as the list every other collection is: the 2x2 quadrant left a
  // hole whenever the count of metrics came out odd.
  const metricList = (
    <ul className={styles.metricList}>
      {workout.intensity > 0 &&
        metric(t('workout.totalVolume'), `${formatNumber(workout.intensity)} ${t('common.kg')}`)}
      {totalReps > 0 && metric(t('common.reps'), formatNumber(totalReps))}
      {totalDistanceKm > 0 &&
        metric(
          t('common.distance'),
          `${formatNumber(convertDistance(totalDistanceKm, DistanceUnit.KILOMETERS, preferredDistanceUnit), 2)} ${distanceUnitLabel(preferredDistanceUnit)}`,
        )}
      {totalSetSeconds > 0 && metric(t('common.time'), formatDurationDisplay(totalSetSeconds))}
      {metric(t('common.duration'), `${durationMinutes} ${t('common.min')}`)}
      {metric(t('workout.setsLogged'), `${setCount}`)}
      {metric(t('workout.personalRecords'), `${personalBestCount}`)}
    </ul>
  )

  const note = workout.note && (
    <div className={styles.summaryNote}>
      <p className={styles.eyebrow}>{t('workout.note')}</p>
      <p>{workout.note}</p>
    </div>
  )

  if (compact) {
    // One row of the feed's list card, so the feed reads as one collection
    // rather than a stack of floating cards. The row carried a byline row, a
    // title band and a 2x2 stat grid — around 340px, and a phone showed one
    // and a half.
    return (
      <li className={styles.feedItem}>
        <Link
          to={`/workouts/${workout.id}`}
          className={styles.feedCardLink}
          aria-label={t('workout.card.viewDetails', { name: workout.name })}
        />

        <div className={styles.feedRow}>
          {/* Decorative: the handle beside it is the link to the profile, and
              two links to the same place is one too many for a screen reader.
              The brand's own initials stand in for a name we were not given. */}
          <span className={styles.avatar} aria-hidden="true">
            {initials(workout.user?.name) || 'GS'}
          </span>

          <div className={styles.feedCopy}>
            {/* Session and account on one line: whose it is belongs with what
                it was, not on a row of its own. */}
            <div className={cn(styles.feedTitle, styles.feedCardControl)}>
              <h2>{workout.name}</h2>
              {/* Gold worn by the row that earned it, not by the whole card:
                  the tinted card said "record" only to sighted readers. */}
              {personalBestCount > 0 && <AppChip tone="record">{t('common.pr')}</AppChip>}
              <Link to={`/users/${workout.user?.id}`}>{handle(workout.user?.username)}</Link>
            </div>

            {/* Volume and sets before the date: the line truncates from the
                end, and the date is the part worth losing first. */}
            <p className={styles.feedMeta}>
              {[
                `${formatNumber(workout.intensity)} ${t('common.kg')}`,
                t('workout.setsCompact', { count: setCount }),
                finishedDate,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          {/* Every card opens the workout, including your own: editing and
              deleting live in the nav bar once it is open. */}
          <ChevronRightIcon className={styles.feedChevron} aria-hidden="true" />
        </div>
      </li>
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
          {actionError && <AppInlineError>{actionError}</AppInlineError>}
        </PageNavAction>
      )}

      {/* The nav bar above carries the title, so the author is a byline under
          it rather than a card between the title and the numbers. */}
      {/* The one place the time of day belongs: here it is a fact about the
          session, not a timestamp on a row. */}
      <p className={styles.byline}>
        <Link to={`/users/${workout.user?.id}`}>{handle(workout.user?.username)}</Link>
        <span aria-hidden="true">·</span>
        {finishedMoment}
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

        {metricList}
        {note}
      </section>

      <section className={styles.detailSection}>
        <header className={styles.sectionHeading}>
          <div>
            <h2>{t('common.exercises')}</h2>
          </div>
          <span>{t('home.exerciseCount', { count: workout.exerciseSets.length })}</span>
        </header>

        {/* A session trained in blocks reads as its blocks; one that was not —
            a plain routine, a quick workout, anything logged before blocks were
            recorded — reads as the flat list it always did. */}
        {grouped ? (
          <div className={styles.blockList}>
            {workout.groups.map((group, groupIndex) => {
              const circuit = group.mode === RoutineGroupMode.CIRCUIT

              return (
                <section key={group.id} className={styles.block}>
                  <header className={styles.blockHeader}>
                    <span className={styles.blockBadge} aria-hidden="true">
                      {groupLetter(groupIndex)}
                    </span>
                    <div>
                      <strong>
                        {t('routine.form.groups.groupName', { letter: groupLetter(groupIndex) })}
                      </strong>
                      <small>{blockSummary(group)}</small>
                    </div>
                  </header>

                  {circuit ? (
                    <CardWorkoutCircuit exercises={group.exercises} />
                  ) : (
                    group.exercises.map((entry, index) => {
                      const key = `${groupIndex}-${index}`

                      return (
                        <CardWorkoutExercise
                          key={key}
                          open={openExercise === key}
                          onToggle={() =>
                            setOpenExercise((current) => (current === key ? '' : key))
                          }
                          exerciseId={entry.exercise?.id}
                          name={entry.exercise?.name}
                          sets={entry.sets}
                          metrics={entry.exercise?.metrics}
                        />
                      )
                    })
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <div className={styles.exerciseList}>
            {workout.exerciseSets.map((exerciseSet, index) => {
              const key = String(index)

              return (
                <CardWorkoutExercise
                  key={exerciseSet.exercise?.id}
                  open={openExercise === key}
                  onToggle={() => setOpenExercise((current) => (current === key ? '' : key))}
                  exerciseId={exerciseSet.exercise?.id}
                  name={exerciseSet.exercise?.name}
                  sets={exerciseSet.sets}
                  metrics={exerciseSet.exercise?.metrics}
                />
              )
            })}
          </div>
        )}
      </section>

      {showComments && (
        <section className={styles.commentsCard}>
          <header className={styles.sectionHeading}>
            <div>
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
            <AppEmptyInline>{t('workout.card.noComments')}</AppEmptyInline>
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
          {commentError && <AppInlineError>{commentError}</AppInlineError>}
        </section>
      )}
    </div>
  )
}
