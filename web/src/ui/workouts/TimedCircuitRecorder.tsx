import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timedCircuit } from '@/native/timedCircuit'
import {
  nextVolume,
  speechVolume,
  useAnnouncementsStore,
  type AnnouncementVolume,
} from '@/stores/announcements'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePreferencesStore } from '@/stores/preferences'
import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppCycleButton } from '@/ui/components/AppCycleButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppStat } from '@/ui/components/AppStat'
import { WorkoutRoute } from '@/ui/features/WorkoutRoute'
import { distanceIn, paceIn } from '@/utils/exerciseMeasurements'
import { hasPaceTargets, type Pacing } from '@/utils/pacing'
import {
  buildTimeline,
  currentPace,
  isIntervalRecording,
  recordedRounds,
  measureRoute,
  routeToken,
  type Phase,
  type Recording,
} from '@/utils/timedCircuit'
import { elapsedLabel } from '@/utils/workoutSession'
import styles from './TimedCircuitRecorder.module.css'

interface Props {
  recordingKey: string
  phases: Phase[]
  /** The session this one is paced against, and how closely. */
  pacing: Pacing
  saved?: Recording
  onComplete: (recording: Recording) => void
  onCancel: () => void
}

export const TimedCircuitRecorder = ({
  recordingKey: key,
  phases,
  pacing,
  saved,
  onComplete,
  onCancel,
}: Props) => {
  const { t, i18n } = useTranslation()
  const unit = usePreferencesStore((state) => state.distanceUnit)
  const autoPause = usePreferencesStore((state) => state.autoPause)
  const volume = useAnnouncementsStore((state) => state.volume)
  const cueLeadSeconds = usePreferencesStore((state) => state.intervalCueLeadSeconds)
  const paceReference = usePreferencesStore((state) => state.paceReference)
  const [recording, setRecording] = useState(saved)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let disposed = false
    let reading = false
    const read = async () => {
      if (reading) return
      reading = true
      try {
        const result = await timedCircuit.read({ key })
        if (!disposed) setNow(Date.now())
        if (!disposed && result.recording) {
          setRecording(result.recording)
          if (result.recording.endedAt && !saved) onComplete(result.recording)
        }
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
  }, [key, saved, onComplete, t])
  const action = async (kind: 'start' | 'pause' | 'resume' | 'finish' | 'clear') => {
    setBusy(true)
    setError('')
    try {
      if (kind === 'start')
        await timedCircuit.start({
          key,
          phases,
          locale: i18n.language,
          volume: speechVolume(volume),
          cueLeadSeconds,
          pacing,
          autoPause,
        })
      else await timedCircuit[kind]({ key })
      if (kind === 'clear') {
        onCancel()
        return
      }
      const result = await timedCircuit.read({ key })
      setRecording(result.recording)
      if (result.recording?.endedAt) onComplete(result.recording)
    } catch {
      setError(t('timedCircuit.failed'))
    } finally {
      setBusy(false)
    }
  }
  // Never disabled and never behind a sheet: this is the one control an athlete
  // reaches for with somebody talking to them, so the tap is the whole gesture
  // and the level moves before the recorder has answered.
  const turn = async () => {
    const level = nextVolume(volume)
    useAnnouncementsStore.getState().setVolume(level)
    setError('')
    try {
      await timedCircuit.setVolume({ key, volume: speechVolume(level) })
    } catch {
      setError(t('timedCircuit.failed'))
    }
  }
  // A recorded run cannot be recovered, and Discard is half a button wide next
  // to the one that ends the session properly.
  const discard = async () => {
    const confirmed = await useConfirmationStore.getState().confirm({
      title: t('timedCircuit.discardTitle'),
      body: t('timedCircuit.discardBody'),
      confirmLabel: t('timedCircuit.discardConfirm'),
      cancelLabel: t('timedCircuit.discardKeep'),
      destructive: true,
    })
    if (confirmed) await action('clear')
  }
  const paused = recording?.pauses.some((pause) => !pause.endedAt)
  const timeline = useMemo(() => (recording ? buildTimeline(recording, now) : []), [recording, now])
  // Every number below is measured from the same edges the saved route is, so
  // the total the athlete watched climb is the total the workout keeps.
  const routes = useMemo(
    () => (recording ? measureRoute(recording, timeline) : []),
    [recording, timeline],
  )
  // Every interval of a circuit is held against the clock; an open one belongs
  // to a session with no set length, which this screen never runs.
  const index = timeline.findIndex(
    (interval) => interval.durationSeconds < (interval.phase.durationSeconds ?? 0),
  )
  const current = timeline[index]
  const next = timeline[index + 1]
  const latest = recording?.points.at(-1)
  const gps = Boolean(latest && latest.accuracy <= 30 && now - latest.timestamp < 15000)
  const held = recording?.pauses.at(-1)
  const elapsed = timeline.reduce((sum, interval) => sum + interval.durationSeconds, 0)
  const progress = current ? current.durationSeconds / (current.phase.durationSeconds ?? 0) : 0
  // A circuit counts every block, so the total is the station's own rounds; an
  // interval session counts the block the routine repeats, and nothing else.
  const intervals = recording ? isIntervalRecording(recording) : false
  const counted = !intervals || current?.phase.role === 'repeat'
  const rounds =
    recording && intervals
      ? recordedRounds(recording)
      : Math.max(
          ...(recording?.phases ?? [])
            .filter((phase) => phase.stationKey === current?.phase.stationKey)
            .map((phase) => phase.round),
          1,
        )
  const pace = recording && !paused ? currentPace(recording, now) : undefined
  const total = distanceIn(
    routes.reduce((sum, route) => sum + route.distanceMeters, 0) / 1000,
    unit,
  )
  // The last interval the athlete actually completed, not the rest after it:
  // resting faster than last time is not a thing anyone is chasing.
  const last = routes
    .filter(
      (route) =>
        route.phase.exerciseId &&
        route.distanceMeters > 0 &&
        route.durationSeconds >= (route.phase.durationSeconds ?? 0),
    )
    .at(-1)
  const exercises = [
    ...new Set(
      (recording?.phases ?? [])
        .filter((phase) => phase.exerciseId)
        .map((phase) => phase.exerciseId),
    ),
  ]
  const volumeLabels: Record<AnnouncementVolume, string> = {
    full: t('timedCircuit.volumeFull'),
    low: t('timedCircuit.volumeLow'),
    off: t('timedCircuit.volumeOff'),
  }
  const paceNow = pace === undefined ? undefined : paceIn(pace, unit)
  const lastPace = last && paceIn((last.durationSeconds / last.distanceMeters) * 1000, unit)
  const lastDistance = last && distanceIn(last.distanceMeters / 1000, unit)
  return (
    <>
      {!recording ? (
        <section className={styles.intro}>
          <h1>{t('timedCircuit.title')}</h1>
          <p>{t('timedCircuit.permission')}</p>
          <AppButton
            type="button"
            colour="primary"
            disabled={busy}
            onClick={() => void action('start')}
          >
            {t('timedCircuit.start')}
          </AppButton>
          {error && <AppInlineError>{error}</AppInlineError>}
          <AppButton type="button" colour="ghost" disabled={busy} onClick={onCancel}>
            {t('timedCircuit.manual')}
          </AppButton>
        </section>
      ) : recording.endedAt ? (
        <section className={styles.review}>
          <WorkoutRoute recording={recording} />
          {error && <AppInlineError>{error}</AppInlineError>}
          <AppButton
            type="button"
            colour="destructive"
            disabled={busy}
            onClick={() => void discard()}
          >
            {t('timedCircuit.cancel')}
          </AppButton>
        </section>
      ) : (
        <section className={styles.screen}>
          <header className={styles.header}>
            {/* The exercise leads and the round follows it: an uppercase
                kicker over a title is the one shape this app does not set a
                heading in, and the name is the louder of the two facts. */}
            <div>
              <h1>{current?.phase.name}</h1>
              {/* An interval session counts its repeating block alone: the
                  warm-up and the cool-down are worked once, outside the count,
                  so neither is announced as a round of anything. */}
              {counted && (
                <p className={styles.round}>
                  {t('timedCircuit.round', { round: current?.phase.round ?? 1, total: rounds })}
                </p>
              )}
            </div>
            <div className={styles.pills}>
              {/* Turned down rather than switched off at the phone, which would
                  take the music with it. */}
              <AppCycleButton
                icon={volume === 'off' ? SpeakerXMarkIcon : SpeakerWaveIcon}
                active={volume !== 'off'}
                label={t('timedCircuit.volumeAction', { level: volumeLabels[volume] })}
                onClick={() => void turn()}
              >
                {volumeLabels[volume]}
              </AppCycleButton>
              {/* The pill says GPS; the live region says what about it. */}
              <p role="status" className={cn(styles.gps, gps && !paused && styles.tracking)}>
                <span className={styles.dot} aria-hidden="true" />
                <span aria-hidden="true">{t('timedCircuit.gps')}</span>
                <span className="sr-only">
                  {t(
                    paused
                      ? held?.auto
                        ? 'timedCircuit.pausedAuto'
                        : 'timedCircuit.paused'
                      : gps
                        ? 'timedCircuit.gpsGood'
                        : 'timedCircuit.gpsPoor',
                  )}
                </span>
              </p>
            </div>
          </header>

          <div className={cn(styles.countdown, paused && styles.held)}>
            <div className={styles.head}>
              <span className={styles.eyebrow}>{t('timedCircuit.intervalLeft')}</span>
              {paused && (
                <span className={styles.chip}>
                  {t(held?.auto ? 'timedCircuit.pausedAutoLabel' : 'timedCircuit.pausedLabel')}
                </span>
              )}
            </div>
            <p className={styles.time}>
              {elapsedLabel(
                Math.ceil((current?.phase.durationSeconds ?? 0) - (current?.durationSeconds ?? 0)),
              )}
            </p>
            <div className={styles.track}>
              <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
            <div className={styles.foot}>
              <span>
                {paused && held
                  ? t('timedCircuit.pausedFor', {
                      time: elapsedLabel(Math.floor((now - held.startedAt) / 1000)),
                    })
                  : next
                    ? t('timedCircuit.nowThenNext', {
                        name: current?.phase.name,
                        duration: elapsedLabel(current?.phase.durationSeconds ?? 0),
                        next: next.phase.name,
                        nextDuration: elapsedLabel(next.phase.durationSeconds ?? 0),
                      })
                    : t('timedCircuit.nowOnly', {
                        name: current?.phase.name,
                        duration: elapsedLabel(current?.phase.durationSeconds ?? 0),
                      })}
              </span>
              <span>{t('timedCircuit.elapsed', { time: elapsedLabel(Math.floor(elapsed)) })}</span>
            </div>
          </div>

          <div className={styles.numbers}>
            <AppStat
              className={cn(styles.cell, styles.divided)}
              size="xl"
              label={t('timedCircuit.paceNow')}
              value={
                paceNow?.value ?? <span className={styles.dash}>{t('timedCircuit.noPace')}</span>
              }
              unit={paceNow?.unit}
            />
            <AppStat
              className={styles.cell}
              size="xl"
              label={t('common.distance')}
              value={total.value}
              unit={total.unit}
            />
            {last && (
              <div className={styles.last}>
                <p className={styles.lastName}>
                  <span
                    className={styles.dot}
                    style={{
                      backgroundColor: `var(${routeToken(exercises.indexOf(last.phase.exerciseId))})`,
                    }}
                    aria-hidden="true"
                  />
                  {t('timedCircuit.lastInterval', {
                    name: last.phase.name,
                    round: last.phase.round,
                  })}
                </p>
                <p className={styles.lastValues}>
                  <span>
                    {lastPace?.value}
                    <small>{lastPace?.unit}</small>
                  </span>
                  <span>
                    {lastDistance?.value}
                    <small>{lastDistance?.unit}</small>
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* The tones are the only thing on this screen with no visible
              counterpart, so the screen says once what they are comparing
              against. Absent where the routine has never been recorded, which
              is exactly when nothing sounds. */}
          {hasPaceTargets(pacing) && (
            <p className={styles.paced}>
              {t(
                paceReference === 'best'
                  ? 'timedCircuit.pacedAgainstBest'
                  : 'timedCircuit.pacedAgainstPrevious',
              )}
            </p>
          )}

          <div className={styles.spacer} />

          {error && <AppInlineError>{error}</AppInlineError>}

          <div className={styles.controls}>
            <AppButton
              type="button"
              colour="primary"
              size="lg"
              disabled={busy}
              onClick={() => void action(paused ? 'resume' : 'pause')}
            >
              {t(paused ? 'timedCircuit.resume' : 'timedCircuit.pause')}
            </AppButton>
            <div className={styles.exits}>
              <AppButton
                type="button"
                colour="secondary"
                disabled={busy}
                onClick={() => void action('finish')}
              >
                {t('timedCircuit.finish')}
              </AppButton>
              <AppButton
                type="button"
                colour="destructive"
                disabled={busy}
                onClick={() => void discard()}
              >
                {t('timedCircuit.cancel')}
              </AppButton>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
