import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { timedCircuit } from '@/native/timedCircuit'
import { useConfirmationStore } from '@/stores/confirmation'
import { renderWithProviders } from '@/ui/testing'
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
  },
}))

describe('TimedCircuitRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(timedCircuit.read).mockResolvedValue({})
    useConfirmationStore.setState({ confirmation: null, resolver: null })
  })
  const phase = {
    exerciseId: 'walk',
    stationKey: 'walk',
    name: 'Walk',
    round: 1,
    durationSeconds: 120,
    instruction: 'Walk for 120 seconds',
  }

  it('requests native recording only after start and leaves manual logging available after refusal', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    vi.mocked(timedCircuit.start).mockRejectedValue(new Error('LOCATION_DENIED'))
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
        phases={[phase]}
        onComplete={vi.fn()}
        onCancel={cancel}
      />,
    )
    expect(timedCircuit.start).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Start guided circuit' }))
    expect(timedCircuit.start).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'athlete:routine', phases: [phase] }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Check location permission')
    await user.click(screen.getByRole('button', { name: 'Log manually' }))
    expect(cancel).toHaveBeenCalledOnce()
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

  it('reads pace as a dash until enough accurate fixes exist, and while paused', async () => {
    const user = userEvent.setup()
    const blurred = running()
    blurred.points = blurred.points.map((point) => ({ ...point, accuracy: 90 }))
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: blurred })
    renderWithProviders(
      <TimedCircuitRecorder
        recordingKey="athlete:routine"
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
})
