import type { Recording } from '@/utils/timedCircuit'

import { create } from '@bufbuild/protobuf'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useNavigationType } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkout, getExercise, listExercises, listWorkouts } from '@/http/requests'
import { timedCircuit } from '@/native/timedCircuit'
import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useConfirmationStore } from '@/stores/confirmation'
import { renderWithProviders } from '@/ui/testing'
import { RecordSession } from './RecordSession'

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

vi.mock('@/http/requests', () => ({
  createWorkout: vi.fn(),
  getExercise: vi.fn(),
  listExercises: vi.fn(),
  listWorkouts: vi.fn(),
}))

const navigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigate,
}))

const bike = create(ExerciseSchema, {
  id: 'bike',
  name: 'Bike commute',
  metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
})

// Two minutes of fixes five seconds apart, eleven metres between each: a walk,
// and enough of a sample for the pace to read as a number rather than a dash.
const recorded = (overrides: Partial<Recording> = {}): Recording => ({
  version: 1,
  startedAt: 1_000_000,
  phases: [
    {
      exerciseId: '',
      stationKey: 'open',
      name: 'Session',
      round: 1,
      instruction: 'Recording Session',
    },
  ],
  pauses: [],
  points: Array.from({ length: 25 }, (_, index) => ({
    timestamp: 1_000_000 + index * 5000,
    latitude: 0,
    longitude: index * 0.0001,
    accuracy: 5,
  })),
  interrupted: false,
  ...overrides,
})

describe('RecordSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(1_120_000)
    vi.mocked(timedCircuit.read).mockResolvedValue({})
    useConfirmationStore.setState({ confirmation: null, resolver: null })
    vi.mocked(listExercises).mockResolvedValue({ exercises: [bike] } as never)
    vi.mocked(listWorkouts).mockResolvedValue({ workouts: [] } as never)
  })

  it('starts an open interval and counts up without a countdown or a round', async () => {
    renderWithProviders(<RecordSession />)

    // No page in front of the session and no tap either: opening the screen is
    // the whole of asking for it.
    expect(await screen.findByText('Active time')).toBeVisible()
    await waitFor(() =>
      expect(timedCircuit.start).toHaveBeenCalledWith(
        expect.objectContaining({
          phases: [expect.not.objectContaining({ durationSeconds: expect.anything() })],
        }),
      ),
    )

    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded() })
    await vi.advanceTimersByTimeAsync(1000)

    expect(await screen.findByText('Active time')).toBeVisible()
    expect(screen.getByText('Runs until you end it')).toBeVisible()
    // Two minutes of active time, counted up rather than down.
    expect(screen.getByText(/^2:0\d$/)).toBeVisible()
    expect(screen.queryByText(/Round/)).not.toBeInTheDocument()
  })

  // Pace answers "how fast per kilometre" and speed answers "how fast": an
  // open session is what a cyclist records, and a cyclist reads the second one.
  it('shows the speed beside the pace, off the same window', async () => {
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded() })
    renderWithProviders(<RecordSession />)

    expect(await screen.findByText('Active time')).toBeVisible()
    expect(screen.getByText('Pace now').parentElement).toHaveTextContent('7:30/km')
    expect(screen.getByText('Speed').parentElement).toHaveTextContent('8km/h')
  })

  // The pill is read at a glance while moving, so the state is in its words
  // rather than only in the colour of a dot.
  it.each([
    ['no fix has arrived yet', { points: [] }, 'Waiting for GPS'],
    ['the last fix is fresh and accurate', {}, 'GPS strong'],
    [
      'the last fix is too vague',
      { points: [{ timestamp: 1_120_000, latitude: 0, longitude: 0, accuracy: 50 }] },
      'GPS weak',
    ],
    [
      'the last fix is stale',
      { points: [{ timestamp: 1_100_000, latitude: 0, longitude: 0, accuracy: 5 }] },
      'GPS weak',
    ],
    // A held session stores no fixes, so the last one going stale is not weak.
    [
      'the session is held',
      {
        points: [{ timestamp: 1_000_000, latitude: 0, longitude: 0, accuracy: 5 }],
        pauses: [{ startedAt: 1_010_000 }],
      },
      'Paused',
    ],
  ] satisfies [string, Partial<Recording>, string][])(
    'says in words when %s',
    async (_, overrides, words) => {
      vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded(overrides) })
      renderWithProviders(<RecordSession />)

      expect(within(await screen.findByRole('status')).getByText(words)).toBeInTheDocument()
    },
  )

  it('asks what a blank session was and saves it as the chosen exercise', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded({ endedAt: 1_120_000 }) })
    vi.mocked(createWorkout).mockResolvedValue({ workoutId: 'saved' } as never)
    renderWithProviders(<RecordSession />)

    await user.click(await screen.findByRole('button', { name: 'Bike commute' }))
    await user.click(screen.getByRole('button', { name: 'Save as Bike commute' }))

    await waitFor(() => expect(createWorkout).toHaveBeenCalledOnce())
    const request = vi.mocked(createWorkout).mock.calls[0][0]
    expect(request.workoutName).toBe('Bike commute')
    expect(request.exerciseSets[0].sets[0].durationSeconds).toBe(120)
    expect(request.exerciseSets[0].sets[0].distance).toBeCloseTo(0.267, 2)
    // The saved document names the interval, so the route measures against it.
    expect(JSON.parse(request.recordingJson).phases[0].exerciseId).toBe('bike')
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workouts/saved', { replace: true }))
  })

  // It never asks which exercise it was, only whether to keep it.
  it('saves a session started from an exercise once the athlete says so', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(getExercise).mockResolvedValue({ exercise: bike } as never)
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded({ endedAt: 1_120_000 }) })
    vi.mocked(createWorkout).mockResolvedValue({ workoutId: 'saved' } as never)
    renderWithProviders(<RecordSession />, { route: '/record?exercise=bike' })

    const sheet = await screen.findByRole('dialog', { name: 'Session ended' })
    expect(screen.queryByText('What was this?')).not.toBeInTheDocument()
    expect(createWorkout).not.toHaveBeenCalled()

    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createWorkout).toHaveBeenCalledOnce())
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workouts/saved', { replace: true }))
  })

  it('tries a refused save once, then only when asked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(getExercise).mockResolvedValue({ exercise: bike } as never)
    // The phone's plugin crosses a bridge, so every read answers with a freshly
    // deserialised recording rather than the same object.
    vi.mocked(timedCircuit.read).mockImplementation(() =>
      Promise.resolve({ recording: recorded({ endedAt: 1_120_000 }) }),
    )
    vi.mocked(createWorkout).mockRejectedValue(new Error('exercise deleted'))
    renderWithProviders(<RecordSession />, { route: '/record?exercise=bike' })

    const sheet = await screen.findByRole('dialog', { name: 'Session ended' })
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createWorkout).toHaveBeenCalledOnce())
    expect(await screen.findByRole('alert')).toHaveTextContent('The session could not be saved')
    await vi.advanceTimersByTimeAsync(5000)
    expect(createWorkout).toHaveBeenCalledOnce()

    vi.mocked(createWorkout).mockResolvedValue({ workoutId: 'saved' } as never)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(createWorkout).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workouts/saved', { replace: true }))
  })

  it('reads location refusal as a reason rather than as a recording failure', async () => {
    vi.mocked(timedCircuit.start).mockRejectedValue(new Error('LOCATION_DENIED'))
    renderWithProviders(<RecordSession />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Location access is needed')
    // Refused, the screen is back where it used to open: the session is the
    // athlete's to start once location is theirs to give.
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  // The recorder keeps the recording, so a screen reopened mid-session finds
  // one already running: starting again would lay a second over the first.
  it('picks up a recording already running rather than starting another', async () => {
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded() })
    renderWithProviders(<RecordSession />)

    expect(await screen.findByText('Active time')).toBeVisible()
    expect(timedCircuit.start).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible()
  })

  // The interval is named when the session starts and the exercise is fetched
  // after the screen opens, so starting itself waits for the name.
  it('waits for the exercise it was opened from before starting', async () => {
    vi.mocked(getExercise).mockResolvedValue({ exercise: bike } as never)
    renderWithProviders(<RecordSession />, { route: '/record?exercise=bike' })

    await waitFor(() =>
      expect(timedCircuit.start).toHaveBeenCalledWith(
        expect.objectContaining({
          phases: [expect.objectContaining({ exerciseId: 'bike', name: 'Bike commute' })],
        }),
      ),
    )
    expect(timedCircuit.start).toHaveBeenCalledOnce()
  })

  // Nor can a tap start it unnamed while the exercise is still on its way.
  it('keeps Start shut while the exercise it was opened from loads', async () => {
    vi.mocked(getExercise).mockReturnValue(new Promise(() => undefined))
    renderWithProviders(<RecordSession />, { route: '/record?exercise=bike' })

    expect(await screen.findByRole('button', { name: 'Start' })).toBeDisabled()
    expect(timedCircuit.start).not.toHaveBeenCalled()
  })

  // An exercise that cannot be fetched is asked for when the session ends,
  // as a blank session's is, rather than holding the start forever.
  it('starts unnamed when the exercise it was opened from cannot be fetched', async () => {
    vi.mocked(getExercise).mockResolvedValue(undefined)
    renderWithProviders(<RecordSession />, { route: '/record?exercise=bike' })

    await waitFor(() =>
      expect(timedCircuit.start).toHaveBeenCalledWith(
        expect.objectContaining({ phases: [expect.objectContaining({ name: 'Session' })] }),
      ),
    )
  })

  // A tap before the recorder has answered is the start; the screen does not
  // start a second one over it once the answer arrives.
  it('starts once when tapped before the recorder has answered', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let answer = (): void => undefined
    vi.mocked(timedCircuit.read).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = () => resolve({})
      }),
    )
    vi.mocked(timedCircuit.start).mockResolvedValue(undefined)
    renderWithProviders(<RecordSession />)

    await user.click(await screen.findByRole('button', { name: 'Start' }))
    await act(async () => answer())

    expect(timedCircuit.start).toHaveBeenCalledOnce()
  })

  // Back from home would reopen the screen and ask for location again.
  it('leaves a refused session by replacing it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(timedCircuit.start).mockRejectedValue(new Error('LOCATION_DENIED'))
    const Home = () => <p>home, {useNavigationType()}</p>
    renderWithProviders(
      <Routes>
        <Route path="/record" element={<RecordSession />} />
        <Route path="/home" element={<Home />} />
      </Routes>,
      { route: '/record' },
    )

    await screen.findByRole('alert')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(await screen.findByText('home, REPLACE')).toBeVisible()
  })

  // Discard used to sit beside End, a slip away from the run it threw out.
  it('keeps discarding out of the controls while recording', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded() })
    renderWithProviders(<RecordSession />)

    await user.click(await screen.findByRole('button', { name: 'End session' }))
    expect(screen.queryByRole('button', { name: /Discard/ })).not.toBeInTheDocument()
    expect(timedCircuit.finish).toHaveBeenCalledOnce()
  })

  // A route already measured is not thrown away on a tap, and a sheet waved
  // away is not a discard.
  it.each([
    ['a blank session', '/record', 'What was this?', 'Close exercise picker'],
    ['a session from an exercise', '/record?exercise=bike', 'Session ended', 'Close'],
  ])('keeps %s when its sheet is closed', async (_, route, title, close) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(getExercise).mockResolvedValue({ exercise: bike } as never)
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded({ endedAt: 1_120_000 }) })
    renderWithProviders(<RecordSession />, { route })

    const sheet = await screen.findByRole('dialog', { name: title })
    await user.click(within(sheet).getByRole('button', { name: close }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useConfirmationStore.getState().confirmation).toBeNull()
    expect(timedCircuit.clear).not.toHaveBeenCalled()
    expect(createWorkout).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save or discard' }))
    expect(await screen.findByRole('dialog', { name: title })).toBeVisible()
  })

  it.each([
    ['a blank session', '/record', 'What was this?'],
    ['a session from an exercise', '/record?exercise=bike', 'Session ended'],
  ])('asks before discarding %s from its sheet', async (_, route, title) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(getExercise).mockResolvedValue({ exercise: bike } as never)
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded({ endedAt: 1_120_000 }) })
    vi.mocked(timedCircuit.clear).mockResolvedValue(undefined)
    renderWithProviders(<RecordSession />, { route })

    const discard = async () => {
      const sheet = await screen.findByRole('dialog', { name: title })
      await user.click(within(sheet).getByRole('button', { name: 'Discard recording' }))
      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
    }

    await discard()
    act(() => useConfirmationStore.getState().dismiss())
    expect(timedCircuit.clear).not.toHaveBeenCalled()

    // Kept, the athlete is back at the choice.
    await discard()
    act(() => useConfirmationStore.getState().accept())
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/home', { replace: true }))
    expect(timedCircuit.clear).toHaveBeenCalledOnce()
    expect(createWorkout).not.toHaveBeenCalled()
  })
})
