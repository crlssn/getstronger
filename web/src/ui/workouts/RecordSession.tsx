import type { Exercise } from '@/proto/api/v1/shared_pb'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { DateTime } from 'luxon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { isConnectivityError } from '@/http/offlineCache'
import { createWorkout, getExercise } from '@/http/requests'
import { dateLocale } from '@/i18n'
import { timedCircuit } from '@/native/timedCircuit'
import posthog from '@/posthog'
import { ExerciseSetsSchema } from '@/proto/api/v1/shared_pb'
import { CreateWorkoutRequestSchema, WorkoutService } from '@/proto/api/v1/workout_service_pb'
import { useActivityStore } from '@/stores/activity'
import { speechVolume, useAnnouncementsStore } from '@/stores/announcements'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { useConnectionStore } from '@/stores/connection'
import { useDashboardStore } from '@/stores/dashboard'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { usePreferencesStore } from '@/stores/preferences'
import { useProgressStore } from '@/stores/progress'
import { useStreakStore } from '@/stores/streak'
import { useToastStore } from '@/stores/toasts'
import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppStat } from '@/ui/components/AppStat'
import { RecordExerciseSheet } from '@/ui/workouts/RecordExerciseSheet'
import { convertDistance, distanceUnitLabel } from '@/utils/distanceUnits'
import { paceWords } from '@/utils/halfwayCue'
import { randomUUID } from '@/utils/randomUUID'
import { distanceIn, paceIn, speedIn } from '@/utils/exerciseMeasurements'
import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import {
  averagePace,
  buildTimeline,
  currentPace,
  measureRoute,
  namedRecording,
  openSessionPhases,
  type Recording,
} from '@/utils/timedCircuit'
import { elapsedLabel } from '@/utils/workoutSession'
import styles from './RecordSession.module.css'

// A recording belongs to a device rather than to a routine, and a session with
// no set length follows none, so its key is the athlete's alone.
const recordingKeyFor = (userId: string) => `${userId}:open-session`

// Both clients answer a refusal of location with the same code: the phone's
// plugin puts it on the rejection, the browser's in its message.
const locationDenied = (failure: unknown) =>
  failure instanceof Error
    ? failure.message.includes('LOCATION_DENIED')
    : (failure as { code?: string } | null)?.code === 'LOCATION_DENIED'

const metersPerKilometer = 1000
const gpsAccuracyMeters = 30
const gpsStaleMs = 15000

/**
 * A session with no set length: one interval that runs until it is ended.
 *
 * Entered blank, the exercise is chosen when the session ends; entered from an
 * exercise's page, it is carried in and the end asks only whether to keep it. Either
 * way the workout is one interval with the route, distance, time and pace the
 * recording measured, which is what a pace chart and a personal best read.
 */
export const RecordSession = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)
  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const cueLeadSeconds = usePreferencesStore((state) => state.intervalCueLeadSeconds)
  const autoPause = usePreferencesStore((state) => state.autoPause)

  const [exercise, setExercise] = useState<Exercise>()
  // Answered, even with nothing: one that cannot be fetched is asked for when
  // the session ends, as a blank session's is.
  const [exerciseRead, setExerciseRead] = useState(false)
  const [recording, setRecording] = useState<Recording>()
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  // A save the server refused, waiting for the athlete to ask again.
  const [refused, setRefused] = useState(false)
  // Whether the recorder has been asked what it is already keeping. The
  // session starts itself, and one already under way is picked up rather than
  // written over.
  const [checked, setChecked] = useState(false)
  // The end-of-session sheet waved away: the recording stays until it is
  // saved or discarded, and the controls bring the sheet back.
  const [sheetClosed, setSheetClosed] = useState(false)

  const savedWorkoutId = useRef('')
  // A second tap can land while the first request is still out.
  const savingSession = useRef(false)
  // Minted once per screen and sent with every attempt, so a save the server
  // committed but never answered is recognised rather than saved twice.
  const [idempotency] = useState(() => randomUUID())

  const requestedExercise = searchParams.get('exercise') ?? ''
  const key = recordingKeyFor(useAuthStore.getState().userId)

  useEffect(() => {
    if (!requestedExercise) return
    let disposed = false
    void getExercise(requestedExercise).then((res) => {
      if (disposed) return
      if (res?.exercise) setExercise(res.exercise)
      setExerciseRead(true)
    })
    return () => {
      disposed = true
    }
  }, [requestedExercise])

  // The recording is read rather than kept: the plugin owns it, so a screen
  // reopened mid-session picks up exactly where the session is.
  useEffect(() => {
    let disposed = false
    let reading = false
    const read = async () => {
      if (reading) return
      reading = true
      try {
        const result = await timedCircuit.read({ key })
        if (disposed) return
        setNow(Date.now())
        if (result.recording) setRecording(result.recording)
      } catch {
        if (!disposed) setError(t('timedCircuit.failed'))
      } finally {
        reading = false
        if (!disposed) setChecked(true)
      }
    }
    void read()
    const timer = setInterval(() => void read(), 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [key, t])

  const title = exercise?.name ?? t('record.session')
  // The interval is named once, when it starts, so nothing starts it before
  // the exercise it was opened from has answered.
  const naming = Boolean(requestedExercise) && !exerciseRead
  // Set by any start, tapped or not, so the screen never lays a second over it.
  const started = useRef(false)
  const start = useCallback(async () => {
    started.current = true
    setBusy(true)
    setError('')
    try {
      await timedCircuit.start({
        key,
        phases: openSessionPhases(title, t('record.instruction', { name: title }), exercise?.id),
        locale: i18n.language,
        // One announcement, at the start — but it is still the phone talking,
        // so it obeys the level the recording screen sets.
        volume: speechVolume(useAnnouncementsStore.getState().volume),
        // The one open interval never reaches a boundary, so nothing here can
        // be said; the recorder is told the athlete's lead all the same.
        cueLeadSeconds,
        cuePhrase: t('timedCircuit.cueSeconds', { count: cueLeadSeconds }),
        // Nor a midpoint: an interval with no end has none to find, so there
        // is no phrase to hand over.
        halfwayPhrase: '',
        distanceUnit: distanceUnitLabel(distanceUnit),
        paceWords: paceWords(t),
        completedPhrase: t('timedCircuit.completed'),
        autoPause,
      })
      const result = await timedCircuit.read({ key })
      setRecording(result.recording)
    } catch (failure) {
      setError(locationDenied(failure) ? t('record.locationDenied') : t('timedCircuit.failed'))
    } finally {
      setBusy(false)
    }
  }, [key, title, exercise, i18n.language, cueLeadSeconds, distanceUnit, autoPause, t])

  // Opening the screen is the whole of asking for the session, so it runs from
  // the moment the screen appears. One the recorder is already keeping is
  // picked up rather than written over, and an exercise the session was opened
  // from is waited for.
  useEffect(() => {
    if (!checked || naming || started.current || recording) return
    void start()
  }, [checked, naming, recording, start])

  const command = async (kind: 'pause' | 'resume' | 'finish') => {
    setBusy(true)
    setError('')
    try {
      await timedCircuit[kind]({ key })
      const result = await timedCircuit.read({ key })
      setRecording(result.recording)
    } catch {
      setError(t('timedCircuit.failed'))
    } finally {
      setBusy(false)
    }
  }

  // Asked only where there is something to lose: the session starts itself,
  // so this exit is now within seconds of a recording the athlete never tapped
  // to start. A finished run always is something to lose.
  const discard = async () => {
    const recorded = Boolean(recording?.endedAt) || (recording?.points.length ?? 0) > 0
    const confirmed =
      !recorded ||
      (await useConfirmationStore.getState().confirm({
        body: t('timedCircuit.discardBody'),
        cancelLabel: t('timedCircuit.discardKeep'),
        confirmLabel: t('timedCircuit.discardConfirm'),
        destructive: true,
        title: t('timedCircuit.discardTitle'),
      }))
    if (!confirmed) return
    await timedCircuit.clear({ key })
    await navigate('/home', { replace: true })
  }

  // The sheet steps aside for the question rather than stacking under it, and
  // is back if the answer is to keep the recording.
  const discardFromSheet = async () => {
    setSheetClosed(true)
    await discard()
    setSheetClosed(false)
  }

  // The session as one interval of whatever it is known by: unnamed, the
  // interval belongs to no exercise and the route measures nothing, so the
  // screen names it provisionally to read its own numbers.
  const measured = useMemo(() => {
    if (!recording) return undefined
    const named = namedRecording(recording, { id: exercise?.id ?? 'open', name: title })
    return measureRoute(named, buildTimeline(named, now))[0]
  }, [recording, exercise?.id, title, now])

  const openPause = recording?.pauses.find((pause) => !pause.endedAt)
  const activeSeconds = Math.floor(measured?.durationSeconds ?? 0)
  const distanceMeters = measured?.distanceMeters ?? 0
  // Paused, there is no pace to read: nothing is being covered.
  const pace = recording && !openPause ? currentPace(recording, now) : undefined
  const average = averagePace(distanceMeters, activeSeconds)
  const distance = distanceIn(distanceMeters / metersPerKilometer, distanceUnit)
  const paceNow = pace === undefined ? undefined : paceIn(pace, distanceUnit)
  const speedNow = pace === undefined ? undefined : speedIn(pace, distanceUnit)
  const averageOverall = average === undefined ? undefined : paceIn(average, distanceUnit)
  const latest = recording?.points.at(-1)
  const gps =
    !!latest && latest.accuracy <= gpsAccuracyMeters && now - latest.timestamp < gpsStaleMs
  const summary = t('record.chooseSummary', {
    time: elapsedLabel(activeSeconds),
    distance: `${distance.value} ${distance.unit}`,
  })

  const save = useCallback(
    async (chosen: Exercise) => {
      if (!recording?.endedAt || savedWorkoutId.current || savingSession.current) return
      savingSession.current = true
      setSaving(true)
      setError('')
      setRefused(false)

      const named = namedRecording(recording, chosen)
      const [route] = measureRoute(named, buildTimeline(named, recording.endedAt))
      const kilometers = route.distanceMeters / metersPerKilometer
      const request = create(CreateWorkoutRequestSchema, {
        exerciseSets: [
          create(ExerciseSetsSchema, {
            exercise: { id: chosen.id },
            sets: [
              {
                distance: convertDistance(kilometers, DistanceUnit.KILOMETERS, distanceUnit),
                distanceUnit,
                durationSeconds: Math.round(route.durationSeconds),
                weight: 0,
                reps: 0,
                weightUnit,
              },
            ],
          }),
        ],
        startedAt: timestampFromDate(new Date(recording.startedAt)),
        finishedAt: timestampFromDate(new Date(recording.endedAt)),
        workoutName: chosen.name,
        idempotencyKey: idempotency,
        recordingJson: JSON.stringify(named),
      })

      try {
        const res = await createWorkout(request)
        if (!res?.workoutId.trim()) {
          setError(t('record.saveFailed'))
          setRefused(true)
          return
        }
        savedWorkoutId.current = res.workoutId
        posthog.capture('workout_completed', {
          exercise_count: 1,
          logged_set_count: 1,
          workout_type: 'recorded',
        })
        await timedCircuit.clear({ key })
        useDashboardStore.getState().load().catch(dashboardUnchanged)
        useStreakStore.getState().reset()
        useActivityStore.getState().reset()
        useProgressStore.getState().reset()
        await navigate(`/workouts/${res.workoutId}`, { replace: true })
      } catch (failure) {
        // A commute ends where it ends, which is often out of signal: the
        // request is queued for reconnect and the session is saved on this
        // device rather than lost with the recording.
        if (isConnectivityError(failure)) {
          useMutationQueueStore.getState().enqueue(WorkoutService.method.createWorkout, request)
          await timedCircuit.clear({ key })
          useConnectionStore.getState().setOnline(false)
          useToastStore.getState().success(t('workout.savedOffline'))
          await navigate('/home', { replace: true })
          return
        }
        setError(t('record.saveFailed'))
        setRefused(true)
      } finally {
        savingSession.current = Boolean(savedWorkoutId.current)
        setSaving(false)
      }
    },
    [recording, distanceUnit, weightUnit, idempotency, key, navigate, t],
  )

  const ended = !!recording?.endedAt
  const sheetOpen = ended && !sheetClosed && !naming

  return (
    <section className={styles.screen}>
      <AppPageHeader
        eyebrow={t('record.eyebrow')}
        title={title}
        action={
          /* The pill names the state in a word; the live region says what it
             means. It waits for the session: nothing is tracked before it. A
             held session stores no fixes, so it reads paused rather than weak. */
          recording && (
            <p role="status" className={cn(styles.gps, gps && !openPause && styles.tracking)}>
              <span className={styles.dot} aria-hidden="true" />
              <span aria-hidden="true">
                {t(
                  openPause
                    ? 'timedCircuit.pausedLabel'
                    : !latest
                      ? 'timedCircuit.gpsWaiting'
                      : gps
                        ? 'timedCircuit.gpsStrong'
                        : 'timedCircuit.gpsWeak',
                )}
              </span>
              <span className="sr-only">
                {t(
                  openPause
                    ? openPause.auto
                      ? 'timedCircuit.pausedAuto'
                      : 'timedCircuit.paused'
                    : gps
                      ? 'timedCircuit.gpsGood'
                      : 'timedCircuit.gpsPoor',
                )}
              </span>
            </p>
          )
        }
      />

      {/* The circuit's countdown card, counting up and with no track: there is
          no prescribed length for the clock to be a fraction of. */}
      <div className={cn(styles.clock, openPause && styles.held)}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>{t('timedCircuit.activeTime')}</span>
          {openPause && (
            <span className={styles.chip}>
              {t(openPause.auto ? 'timedCircuit.pausedAutoLabel' : 'timedCircuit.pausedLabel')}
            </span>
          )}
        </div>
        <p className={styles.time}>{elapsedLabel(activeSeconds)}</p>
        <div className={styles.foot}>
          {/* Paused, the line says how long for; running, it says why there is
              no countdown above it. */}
          <span>
            {openPause
              ? t('timedCircuit.pausedFor', {
                  time: elapsedLabel(Math.max(0, Math.floor((now - openPause.startedAt) / 1000))),
                })
              : t('record.openEnded')}
          </span>
          {recording && (
            <span>
              {t('record.startedAt', {
                time: DateTime.fromMillis(recording.startedAt)
                  .setLocale(dateLocale())
                  .toLocaleString(DateTime.TIME_SIMPLE),
              })}
            </span>
          )}
        </div>
      </div>

      <div className={styles.numbers}>
        <AppStat
          className={cn(styles.cell, styles.divided)}
          size="xl"
          label={t('timedCircuit.paceNow')}
          value={paceNow?.value ?? <span className={styles.dash}>{t('timedCircuit.noPace')}</span>}
          unit={paceNow?.unit}
        />
        <AppStat
          className={styles.cell}
          size="xl"
          label={t('timedCircuit.speedNow')}
          value={speedNow?.value ?? <span className={styles.dash}>{t('timedCircuit.noPace')}</span>}
          unit={speedNow?.unit}
        />
        {/* The total takes the width of both rates above it: it is the figure
            the session is remembered by. */}
        <AppStat
          className={cn(styles.cell, styles.total)}
          size="xl"
          label={t('common.distance')}
          value={distance.value}
          unit={distance.unit}
        />
        {/* One value rather than two: an open session has no interval before
            this one to be measured against, so it is measured against itself. */}
        <p className={styles.strip}>
          <span>{t('record.average')}</span>
          <span className={styles.stripValue}>
            {averageOverall?.value ?? t('timedCircuit.noPace')}
            {averageOverall && <small>{averageOverall.unit}</small>}
          </span>
        </p>
      </div>

      {error && <AppInlineError>{error}</AppInlineError>}
      {refused && exercise && (
        <AppButton
          type="button"
          colour="primary"
          size="lg"
          disabled={saving}
          onClick={() => void save(exercise)}
        >
          {t('common.retry')}
        </AppButton>
      )}

      {/* One control in the same place throughout: it starts the session,
          then holds it and lets it go again. */}
      <div className={styles.controls}>
        <AppButton
          type="button"
          colour="primary"
          size="lg"
          disabled={busy || ended || (!recording && naming)}
          onClick={() => void (recording ? command(openPause ? 'resume' : 'pause') : start())}
        >
          {t(
            !recording
              ? 'timedCircuit.begin'
              : openPause
                ? 'timedCircuit.resume'
                : 'timedCircuit.pause',
          )}
        </AppButton>
        {/* Discard is not beside End, where a slip throws a run away: it is
            one of the two answers the end asks for. */}
        {recording ? (
          <AppButton
            type="button"
            colour="secondary"
            disabled={busy || saving}
            onClick={() => (ended ? setSheetClosed(false) : void command('finish'))}
          >
            {t(ended ? 'record.saveOrDiscard' : 'timedCircuit.finish')}
          </AppButton>
        ) : (
          /* Nothing to end or discard yet, so the way out is the way back —
             replacing this screen, which Back would reopen and start again. */
          <AppButton type="link" colour="ghost" to="/home" replace>
            {t('common.cancel')}
          </AppButton>
        )}
      </div>

      {sheetOpen &&
        (exercise ? (
          <AppSheet
            title={t('record.endedTitle')}
            body={summary}
            closeLabel={t('common.close')}
            onClose={() => setSheetClosed(true)}
            actions={
              <>
                <SheetAction
                  tone="primary"
                  disabled={saving}
                  onClick={() => {
                    setSheetClosed(true)
                    void save(exercise)
                  }}
                >
                  {t('common.save')}
                </SheetAction>
                <SheetAction
                  tone="dangerOutline"
                  disabled={saving}
                  onClick={() => void discardFromSheet()}
                >
                  {t('timedCircuit.discardConfirm')}
                </SheetAction>
              </>
            }
          />
        ) : (
          <RecordExerciseSheet
            summary={summary}
            saving={saving}
            onSave={(chosen) => void save(chosen)}
            onDiscard={() => void discardFromSheet()}
            onClose={() => setSheetClosed(true)}
          />
        ))}
    </section>
  )
}

const dashboardUnchanged = () => {
  /* A dashboard that did not reload is not worth reporting on a saved session. */
}
