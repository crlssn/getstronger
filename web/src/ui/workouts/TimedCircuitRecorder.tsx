import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timedCircuit } from '@/native/timedCircuit'
import {
  nextVolume,
  speechVolume,
  useAnnouncementsStore,
  volumeLabelKey,
  type AnnouncementVolume,
} from '@/stores/announcements'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePreferencesStore } from '@/stores/preferences'
import { cn } from '@/ui/cn'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { AppButton } from '@/ui/components/AppButton'
import { AppCycleButton } from '@/ui/components/AppCycleButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppStat } from '@/ui/components/AppStat'
import { WorkoutRoute } from '@/ui/features/WorkoutRoute'
import { distanceIn, paceIn, speedIn, type Measured } from '@/utils/exerciseMeasurements'
import { halfwayPhrase } from '@/utils/halfwayCue'
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

/** How often the pace on the screen changes, in milliseconds. */
export const paceRefreshMs = 5000

/** One figure of a finished interval: the number, with its unit set quieter. */
const IntervalMeasure = ({ measured }: { measured?: Measured }) => (
  <span className={styles.historyValue}>
    {measured?.value}
    {measured && <small>{measured.unit}</small>}
  </span>
)

/** The decimals the live total keeps, so it moves with the athlete. */
const liveDistanceDigits = 3

interface Props {
  recordingKey: string
  phases: Phase[]
  /** The session this one is paced against, and how closely. */
  pacing: Pacing
  saved?: Recording
  onComplete: (recording: Recording) => void
  onCancel: () => void
  /** Keeps the finished recording, where there is one to keep. */
  onSave?: () => void
  /** Whether that save is in flight, and what it said if it failed. */
  saving?: boolean
  saveError?: string
}

export const TimedCircuitRecorder = ({
  recordingKey: key,
  phases,
  pacing,
  saved,
  onComplete,
  onCancel,
  onSave,
  saving = false,
  saveError = '',
}: Props) => {
  const { t, i18n } = useTranslation()
  const unit = usePreferencesStore((state) => state.distanceUnit)
  const autoPause = usePreferencesStore((state) => state.autoPause)
  const volume = useAnnouncementsStore((state) => state.volume)
  const cueLeadSeconds = usePreferencesStore((state) => state.intervalCueLeadSeconds)
  const halfwayCue = usePreferencesStore((state) => state.halfwayCue)
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
          // Spoken by the recorder, so it is handed the words rather than
          // asked to translate.
          cuePhrase: t('timedCircuit.cueSeconds', { count: cueLeadSeconds }),
          // The pace is only known while the interval is being run, so the
          // recorder is handed the phrase with the hole still in it.
          halfwayPhrase: halfwayCue ? halfwayPhrase(t, unit) : '',
          distanceUnit: distanceUnitLabel(unit),
          completedPhrase: t('timedCircuit.completed'),
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
  // Before the first tap there is nothing recorded, and the screen still has
  // to show the session it is about to run: a recording that starts now has
  // the first interval at its full length and every figure blank, which is
  // exactly that screen.
  const shown: Recording = useMemo(
    () =>
      recording ?? {
        version: 1,
        startedAt: now,
        phases,
        pauses: [],
        points: [],
        interrupted: false,
      },
    [recording, now, phases],
  )
  const paused = shown.pauses.some((pause) => !pause.endedAt)
  const timeline = useMemo(() => buildTimeline(shown, now), [shown, now])
  // Every number below is measured from the same edges the saved route is, so
  // the total the athlete watched climb is the total the workout keeps.
  const routes = useMemo(() => measureRoute(shown, timeline), [shown, timeline])
  // Every interval of a circuit is held against the clock; an open one belongs
  // to a session with no set length, which this screen never runs.
  const index = timeline.findIndex(
    (interval) => interval.durationSeconds < (interval.phase.durationSeconds ?? 0),
  )
  const current = timeline[index]
  const next = timeline[index + 1]
  const latest = shown.points.at(-1)
  const gps = Boolean(latest && latest.accuracy <= 30 && now - latest.timestamp < 15000)
  const held = shown.pauses.at(-1)
  const elapsed = timeline.reduce((sum, interval) => sum + interval.durationSeconds, 0)
  const progress = current ? current.durationSeconds / (current.phase.durationSeconds ?? 0) : 0
  // A circuit counts every block, so the total is the station's own rounds; an
  // interval session counts the block the routine repeats, and nothing else.
  const intervals = isIntervalRecording(shown)
  const counted = !intervals || current?.phase.role === 'repeat'
  const rounds = intervals
    ? recordedRounds(shown)
    : Math.max(
        ...shown.phases
          .filter((phase) => phase.stationKey === current?.phase.stationKey)
          .map((phase) => phase.round),
        1,
      )
  // Read at the last refresh rather than at every poll: a window that moves a
  // second at a time takes a new fix on every poll, and a figure that changes
  // every second is not one a runner can act on.
  const pace = paused ? undefined : currentPace(shown, now - (now % paceRefreshMs))
  // Every decimal, and every fix: a total that turns over once every ten
  // metres reads as a stalled GPS at a walk.
  const total = distanceIn(
    routes.reduce((sum, route) => sum + route.distanceMeters, 0) / 1000,
    unit,
    liveDistanceDigits,
  )
  // How far this interval has come, beside the total: a runner chasing 400 m
  // of hard running should not have to subtract.
  const intervalDistance = distanceIn(
    (routes[index]?.distanceMeters ?? 0) / 1000,
    unit,
    liveDistanceDigits,
  )
  // Every interval the athlete actually completed, newest first, and no rest
  // among them: resting faster than last time is not a thing anyone is
  // chasing. Round four is run against rounds one to three, so all of them
  // stay on the screen.
  const finished = routes
    .filter(
      (route) =>
        route.phase.exerciseId &&
        route.distanceMeters > 0 &&
        route.durationSeconds >= (route.phase.durationSeconds ?? 0),
    )
    .reverse()
  const exercises = [
    ...new Set(shown.phases.filter((phase) => phase.exerciseId).map((phase) => phase.exerciseId)),
  ]
  const volumeLabels: Record<AnnouncementVolume, string> = {
    full: t(volumeLabelKey.full),
    low: t(volumeLabelKey.low),
    off: t(volumeLabelKey.off),
  }
  const paceNow = pace === undefined ? undefined : paceIn(pace, unit)
  const speedNow = pace === undefined ? undefined : speedIn(pace, unit)
  return (
    <>
      {recording?.endedAt ? (
        <section className={styles.review}>
          <WorkoutRoute recording={recording} />
          {error && <AppInlineError>{error}</AppInlineError>}
          {saveError && <AppInlineError>{saveError}</AppInlineError>}
          {/* Keeping the run is what the athlete came back for, so it leads
              and throwing it away follows, in the quietest button there is:
              the two used to sit the other way round, with the exit wearing
              the louder colour of the pair. */}
          {onSave && (
            <AppButton type="button" colour="primary" disabled={busy || saving} onClick={onSave}>
              {t('common.save')}
            </AppButton>
          )}
          <AppButton
            type="button"
            colour="ghost"
            disabled={busy || saving}
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
              {/* The pill says GPS; the live region says what about it. It
                  waits for the session: nothing is being tracked before it. */}
              {recording && (
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
              )}
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
            <div className={styles.rates}>
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
                label={t('timedCircuit.speedNow')}
                value={
                  speedNow?.value ?? <span className={styles.dash}>{t('timedCircuit.noPace')}</span>
                }
                unit={speedNow?.unit}
              />
            </div>
            {/* The two distances under the two rates: this interval's beside
                the session's, the second being the figure a session is
                remembered by. */}
            <div className={styles.distances}>
              <AppStat
                className={cn(styles.cell, styles.divided)}
                size="xl"
                label={t('timedCircuit.intervalDistance')}
                value={intervalDistance.value}
                unit={intervalDistance.unit}
              />
              <AppStat
                className={styles.cell}
                size="xl"
                label={t('timedCircuit.totalDistance')}
                value={total.value}
                unit={total.unit}
              />
            </div>
            {finished.length > 0 && (
              <div className={styles.history}>
                {/* The column titles share the heading's row, aligned over
                    the figures they name. */}
                <div className={cn(styles.historyRow, styles.historyTitles)}>
                  <p>{t('timedCircuit.intervalHistory')}</p>
                  <span>{t('timedCircuit.pace')}</span>
                  <span>{t('timedCircuit.speedNow')}</span>
                  <span>{t('common.distance')}</span>
                </div>
                {/* Scrolls within its own height, and it is the only thing on
                    the screen that does: the controls that end a session stay
                    under the thumb however many rounds are in. */}
                <ul className={styles.historyList}>
                  {finished.map((route) => (
                    <li
                      key={`${route.phase.stationKey}-${route.phase.round}`}
                      className={styles.historyRow}
                    >
                      <p className={styles.historyName}>
                        <span
                          className={styles.dot}
                          style={{
                            backgroundColor: `var(${routeToken(exercises.indexOf(route.phase.exerciseId))})`,
                          }}
                          aria-hidden="true"
                        />
                        {t('timedCircuit.intervalNamed', {
                          name: route.phase.name,
                          round: route.phase.round,
                        })}
                      </p>
                      <IntervalMeasure
                        measured={paceIn(
                          (route.durationSeconds / route.distanceMeters) * 1000,
                          unit,
                        )}
                      />
                      <IntervalMeasure
                        measured={speedIn(
                          (route.durationSeconds / route.distanceMeters) * 1000,
                          unit,
                        )}
                      />
                      <IntervalMeasure measured={distanceIn(route.distanceMeters / 1000, unit)} />
                    </li>
                  ))}
                </ul>
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

          {/* One control in the same place throughout: it starts the session,
              then holds it and lets it go again. */}
          <div className={styles.controls}>
            <AppButton
              type="button"
              colour="primary"
              size="lg"
              disabled={busy}
              onClick={() => void action(!recording ? 'start' : paused ? 'resume' : 'pause')}
            >
              {/* The screen opens on a routine written in minutes without
                  being asked for, so the button that starts it says what it
                  starts — the same words the form's dock offers. */}
              {t(
                !recording
                  ? 'timedCircuit.start'
                  : paused
                    ? 'timedCircuit.resume'
                    : 'timedCircuit.pause',
              )}
            </AppButton>
            {recording ? (
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
            ) : (
              /* Nothing to end or discard yet; what the athlete may still want
                 is the ordinary form, which is what this session replaces. */
              <AppButton type="button" colour="ghost" disabled={busy} onClick={onCancel}>
                {t('timedCircuit.manual')}
              </AppButton>
            )}
          </div>
        </section>
      )}
    </>
  )
}
