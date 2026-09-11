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
import { AppStat } from '@/ui/components/AppStat'
import { RecordExerciseSheet } from '@/ui/workouts/RecordExerciseSheet'
import { convertDistance, distanceUnitLabel } from '@/utils/distanceUnits'
import { paceWords } from '@/utils/halfwayCue'
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
 * exercise's page, it is carried in and the session saves straight away. Either
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
  const [recording, setRecording] = useState<Recording>()
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  // A save the server refused, waiting for the athlete to ask again.
  const [refused, setRefused] = useState(false)

  const savedWorkoutId = useRef('')
  // The phone answers every read with a fresh recording, so an effect that
  // saved whenever it changed would re-send a refused save every second.
  const autoSaved = useRef(false)
  // The screen reads the recording every second, so the effect that saves an
  // already-named session can fire again while the first request is still out.
  const savingSession = useRef(false)
  // Minted once per screen and sent with every attempt, so a save the server
  // committed but never answered is recognised rather than saved twice.
  const [idempotency] = useState(() => crypto.randomUUID())

  const requestedExercise = searchParams.get('exercise') ?? ''
  const key = recordingKeyFor(useAuthStore.getState().userId)

  useEffect(() => {
    if (!requestedExercise) return
    let disposed = false
    void getExercise(requestedExercise).then((res) => {
      if (!disposed && res?.exercise) setExercise(res.exercise)
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
  const start = async () => {
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
  }

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

  const discard = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('timedCircuit.discardBody'),
      cancelLabel: t('timedCircuit.discardKeep'),
      confirmLabel: t('timedCircuit.discardConfirm'),
      destructive: true,
      title: t('timedCircuit.discardTitle'),
    })
    if (!confirmed) return
    await timedCircuit.clear({ key })
    await navigate('/home', { replace: true })
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

  // A session that carried its exercise in never asks which one it was, and
  // saves itself once: after a refusal, the next attempt is the athlete's.
  const ended = !!recording?.endedAt
  useEffect(() => {
    if (!ended || !exercise || savedWorkoutId.current || autoSaved.current) return
    autoSaved.current = true
    void save(exercise)
  }, [ended, exercise, save])

  return (
    <section className={styles.screen}>
      <AppPageHeader
        eyebrow={t('record.eyebrow')}
        title={title}
        action={
          /* The pill says GPS; the live region says what about it. It waits
             for the session: nothing is being tracked before it. */
          recording && (
            <p role="status" className={cn(styles.gps, gps && !openPause && styles.tracking)}>
              <span className={styles.dot} aria-hidden="true" />
              <span aria-hidden="true">{t('timedCircuit.gps')}</span>
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
          disabled={busy || ended}
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
        {recording ? (
          <div className={styles.secondaryControls}>
            <AppButton
              type="button"
              colour="secondary"
              disabled={busy || saving || ended}
              onClick={() => void command('finish')}
            >
              {t('timedCircuit.finish')}
            </AppButton>
            <AppButton
              type="button"
              colour="destructive"
              disabled={busy || saving}
              onClick={() => void discard()}
            >
              {t('timedCircuit.cancel')}
            </AppButton>
          </div>
        ) : (
          /* Nothing to end or discard yet, so the way out is the way back. */
          <AppButton type="link" colour="ghost" to="/home">
            {t('common.cancel')}
          </AppButton>
        )}
      </div>

      {ended && !exercise && (
        <RecordExerciseSheet
          summary={summary}
          saving={saving}
          onSave={(chosen) => void save(chosen)}
          onClose={() => void discard()}
        />
      )}
    </section>
  )
}

const dashboardUnchanged = () => {
  /* A dashboard that did not reload is not worth reporting on a saved session. */
}
