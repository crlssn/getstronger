import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timedCircuit } from '@/native/timedCircuit'
import { AppButton } from '@/ui/components/AppButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { WorkoutRoute } from '@/ui/features/WorkoutRoute'
import { buildTimeline, type Phase, type Recording } from '@/utils/timedCircuit'
import { elapsedLabel } from '@/utils/workoutSession'

interface Props {
  recordingKey: string
  phases: Phase[]
  saved?: Recording
  onComplete: (recording: Recording) => void
  onCancel: () => void
}

export const TimedCircuitRecorder = ({
  recordingKey: key,
  phases,
  saved,
  onComplete,
  onCancel,
}: Props) => {
  const { t, i18n } = useTranslation()
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
      if (kind === 'start') await timedCircuit.start({ key, phases, locale: i18n.language })
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
  const paused = recording?.pauses.some((pause) => !pause.endedAt)
  const timeline = recording ? buildTimeline(recording, now) : []
  const current = timeline.find(
    (interval) => interval.durationSeconds < interval.phase.durationSeconds,
  )
  const latest = recording?.points.at(-1)
  const gps = latest && latest.accuracy <= 30 && now - latest.timestamp < 15000
  return (
    <section className="space-y-4">
      {!recording ? (
        <>
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
        </>
      ) : recording.endedAt ? (
        <WorkoutRoute recording={recording} />
      ) : (
        <>
          <h1>{current?.phase.name}</h1>
          <p className="text-4xl tabular-nums">
            {elapsedLabel(
              Math.ceil((current?.phase.durationSeconds ?? 0) - (current?.durationSeconds ?? 0)),
            )}
          </p>
          <p>
            {t('timedCircuit.round', {
              round: current?.phase.round ?? 1,
              total: Math.max(
                ...recording.phases
                  .filter((phase) => phase.stationKey === current?.phase.stationKey)
                  .map((phase) => phase.round),
                1,
              ),
            })}
          </p>
          <p role="status">
            {t(
              paused
                ? 'timedCircuit.paused'
                : gps
                  ? 'timedCircuit.gpsGood'
                  : 'timedCircuit.gpsPoor',
            )}
          </p>
          <AppButton
            type="button"
            colour="primary"
            disabled={busy}
            onClick={() => void action(paused ? 'resume' : 'pause')}
          >
            {t(paused ? 'timedCircuit.resume' : 'timedCircuit.pause')}
          </AppButton>
          <AppButton
            type="button"
            colour="primary"
            disabled={busy}
            onClick={() => void action('finish')}
          >
            {t('timedCircuit.finish')}
          </AppButton>
        </>
      )}
      {error && <AppInlineError>{error}</AppInlineError>}
      {!recording && (
        <AppButton type="button" colour="ghost" disabled={busy} onClick={onCancel}>
          {t('timedCircuit.manual')}
        </AppButton>
      )}
      {recording && (
        <AppButton
          type="button"
          colour="destructive"
          disabled={busy}
          onClick={() => void action('clear')}
        >
          {t('timedCircuit.cancel')}
        </AppButton>
      )}
    </section>
  )
}
