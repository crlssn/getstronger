import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { timedCircuit } from '@/native/timedCircuit'
import { useAnnouncementsStore } from '@/stores/announcements'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { pacingFor } from '@/utils/pacing'
import type { Recording, RoutePoint } from '@/utils/timedCircuit'
import { TimedCircuitRecorder } from './TimedCircuitRecorder'

vi.mock('@/native/timedCircuit', () => ({
  timedCircuit: {
    start: vi.fn(),
    read: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    finish: vi.fn(),
    clear: vi.fn(),
    setVolume: vi.fn(),
  },
}))

describe('TimedCircuitRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(timedCircuit.read).mockResolvedValue({})
    useConfirmationStore.setState({ confirmation: null, resolver: null })
    useAnnouncementsStore.setState({ volume: 'full' })
    usePreferencesStore.setState({ intervalCueLeadSeconds: 10 })
  })
  const phase = {
    exerciseId: 'walk',
    stationKey: 'walk',
    name: 'Walk',
    round: 1,
    durationSeconds: 120,
    instruction: 'Walk for 2 minutes',
  }

  it('requests native recording only after start and leaves manual logging available after refusal', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    vi.mocked(timedCircuit.start).mockRejectedValue(new Error('LOCATION_DENIED'))
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={cancel}
      />,
    )
    expect(timedCircuit.start).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Start guided circuit' }))
    // The comparison travels with the prescription: the phone owns it from
    // there, screen locked and WebView asleep.
    expect(timedCircuit.start).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'athlete:routine',
        phases: [phase],
        pacing: pacingFor([phase]),
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Check location permission')
    await user.click(screen.getByRole('button', { name: 'Log manually' }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  // The recorder is told the lead when the session starts, which is what makes
  // a change in settings reach the next recording and not this one.
  it('hands the athlete lead to the recorder it starts', async () => {
    const user = userEvent.setup()
    usePreferencesStore.setState({ intervalCueLeadSeconds: 20 })
    vi.mocked(timedCircuit.start).mockResolvedValue(undefined)
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start guided circuit' }))

    expect(timedCircuit.start).toHaveBeenCalledWith(expect.objectContaining({ cueLeadSeconds: 20 }))
  })

  it('restores native progress and sends pause, resume, and early finish to native', async () => {
    const user = userEvent.setup()
    const complete = vi.fn()
    const data: Recording = {
      version: 1,
      startedAt: Date.now() - 30000,
      phases: [phase],
      pauses: [],
      points: [],
      interrupted: false,
    }
    vi.mocked(timedCircuit.read).mockImplementation(() =>
      Promise.resolve({ recording: structuredClone(data) }),
    )
    vi.mocked(timedCircuit.pause).mockImplementation(() => {
      data.pauses.push({ startedAt: Date.now() })
      return Promise.resolve()
    })
    vi.mocked(timedCircuit.resume).mockImplementation(() => {
      data.pauses[0].endedAt = Date.now()
      return Promise.resolve()
    })
    vi.mocked(timedCircuit.finish).mockImplementation(() => {
      data.endedAt = Date.now()
      return Promise.resolve()
    })
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={complete}
        onCancel={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { name: 'Walk' })
    await user.click(screen.getByRole('button', { name: /^Pause$/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
    await user.click(screen.getByRole('button', { name: /^Resume$/ }))
    await user.click(screen.getByRole('button', { name: 'End session' }))
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ endedAt: expect.any(Number) }),
      ),
    )
    expect(screen.getByRole('heading', { name: 'Workout route' })).toBeVisible()
  })

  // Five minutes of walking, then a minute and a half of running: the screen
  // has to say how fast the athlete is going now, how the last interval went,
  // and how far the session has come.
  const running = (): Recording => {
    const startedAt = Date.now() - 400000
    const walk = { ...phase, durationSeconds: 300 }
    const run = {
      ...phase,
      exerciseId: 'run',
      stationKey: 'run',
      name: 'Run',
      durationSeconds: 300,
    }
    const fix = (second: number, meters: number): RoutePoint => ({
      timestamp: startedAt + second * 1000,
      latitude: meters / 111194.93,
      longitude: 0,
      accuracy: 5,
    })
    return {
      version: 1,
      startedAt,
      phases: [walk, run],
      pauses: [],
      points: [
        // Three metres a second for the walk, four since the run started.
        ...Array.from({ length: 301 }, (_, second) => fix(second, second * 3)),
        ...Array.from({ length: 100 }, (_, second) => fix(301 + second, 900 + (second + 1) * 4)),
      ],
      interrupted: false,
    }
  }

  it('shows the pace now, the total distance, and how the last interval went', async () => {
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: running() })
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { name: 'Run' })
    expect(screen.getByText('Pace now').parentElement).toHaveTextContent('4:10/km')
    expect(screen.getByText('Distance').parentElement).toHaveTextContent('1.3km')
    // The interval that finished, named and measured: what there is to beat.
    const last = screen.getByText('Last · Walk 1')
    expect(last.parentElement).toHaveTextContent('5:33/km')
    expect(last.parentElement).toHaveTextContent('900m')
  })

  it('says which session the tones compare with, and only where there is one', async () => {
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: running() })
    const paced = { ...pacingFor([phase]), targets: [330] }
    const { rerender } = renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={paced}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { name: 'Run' })
    expect(screen.getByText(/Tones compare each interval with your last session/)).toBeVisible()

    // A routine recorded for the first time has nothing to compare with, and
    // the line goes with the tones.
    rerender(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Tones compare each interval/)).not.toBeInTheDocument()
  })

  it('reads pace as a dash until enough accurate fixes exist, and while paused', async () => {
    const user = userEvent.setup()
    const blurred = running()
    blurred.points = blurred.points.map((point) => ({ ...point, accuracy: 90 }))
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: blurred })
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { name: 'Run' })
    expect(screen.getByText('Pace now').parentElement).toHaveTextContent('—')
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for accurate GPS')

    const paused = running()
    paused.pauses = [{ startedAt: Date.now() - 5000 }]
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: paused })
    vi.mocked(timedCircuit.pause).mockResolvedValue()
    await user.click(screen.getByRole('button', { name: /^Pause$/ }))
    expect(await screen.findByRole('button', { name: /^Resume$/ })).toBeVisible()
    // Standing still is not a pace, but the ground already covered is a
    // distance: only the number that means "now" gives up its value.
    expect(screen.getByText('Pace now').parentElement).toHaveTextContent('—')
    expect(screen.getByText('Distance').parentElement).toHaveTextContent('1.28km')
  })

  // Discard is half a button wide beside End session, and a recorded run is
  // not recoverable, so the tap is a question rather than an outcome.
  it('asks before discarding a recording', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: running() })
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={cancel}
      />,
    )
    await screen.findByRole('heading', { name: 'Run' })
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
    useConfirmationStore.getState().dismiss()
    expect(timedCircuit.clear).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
    useConfirmationStore.getState().accept()
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(timedCircuit.clear).toHaveBeenCalledWith({ key: 'athlete:routine' })
  })

  // A warm-up is worked once, before the count, so announcing it as a round of
  // anything says something the routine never asked for.
  it('counts the rounds of the repeating block alone', async () => {
    const intervals: Recording = {
      version: 1,
      startedAt: Date.now() - 1000,
      phases: [
        { ...phase, role: 'warmup', durationSeconds: 300 },
        { ...phase, exerciseId: 'run', stationKey: 'run', name: 'Run', role: 'repeat' },
        { ...phase, role: 'repeat', round: 2 },
      ],
      pauses: [],
      points: [],
      interrupted: false,
    }
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: intervals })

    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={intervals.phases}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await screen.findByRole('heading', { name: 'Walk' })
    expect(screen.queryByText(/^Round \d+ of \d+$/)).not.toBeInTheDocument()
  })

  // One tap, mid-run, one-handed: the level is on the control, and every step
  // reaches the recorder that is doing the speaking.
  it('cycles the announcement volume and hands each level to the recorder', async () => {
    const user = userEvent.setup()
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: running() })
    vi.mocked(timedCircuit.setVolume).mockResolvedValue()
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { name: 'Run' })

    await user.click(screen.getByRole('button', { name: 'Voice volume: Full. Tap to change' }))
    expect(timedCircuit.setVolume).toHaveBeenLastCalledWith({
      key: 'athlete:routine',
      volume: 0.4,
    })

    await user.click(screen.getByRole('button', { name: 'Voice volume: Low. Tap to change' }))
    expect(timedCircuit.setVolume).toHaveBeenLastCalledWith({ key: 'athlete:routine', volume: 0 })

    await user.click(screen.getByRole('button', { name: 'Voice volume: Off. Tap to change' }))
    expect(timedCircuit.setVolume).toHaveBeenLastCalledWith({ key: 'athlete:routine', volume: 1 })
    expect(screen.getByRole('button', { name: 'Voice volume: Full. Tap to change' })).toBeVisible()
  })

  // Turned down last time is turned down this time: the level is the athlete's
  // rather than the session's.
  it('starts the next session at the level the last one was left on', async () => {
    const user = userEvent.setup()
    useAnnouncementsStore.setState({ volume: 'off' })
    vi.mocked(timedCircuit.start).mockResolvedValue()
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start guided circuit' }))

    expect(timedCircuit.start).toHaveBeenCalledWith(expect.objectContaining({ volume: 0 }))
  })

  it('announces the round once the repeating block starts', async () => {
    const intervals: Recording = {
      version: 1,
      // The warm-up is behind us, so the block is what is being worked now.
      startedAt: Date.now() - 301000,
      phases: [
        { ...phase, role: 'warmup', durationSeconds: 300 },
        { ...phase, exerciseId: 'run', stationKey: 'run', name: 'Run', role: 'repeat' },
        { ...phase, role: 'repeat', round: 2 },
      ],
      pauses: [],
      points: [],
      interrupted: false,
    }
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: intervals })

    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        pacing={pacingFor([phase])}
        phases={intervals.phases}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await screen.findByRole('heading', { name: 'Run' })
    expect(screen.getByText('Round 1 of 2')).toBeVisible()
  })
})
