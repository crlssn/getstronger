import type { Recording } from '@/utils/timedCircuit'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkout, getExercise, listExercises, listWorkouts } from '@/http/requests'
import { timedCircuit } from '@/native/timedCircuit'
import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
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
    vi.mocked(listExercises).mockResolvedValue({ exercises: [bike] } as never)
    vi.mocked(listWorkouts).mockResolvedValue({ workouts: [] } as never)
  })

  it('starts an open interval and counts up without a countdown or a round', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<RecordSession />)

    await user.click(await screen.findByRole('button', { name: 'Start recording' }))
    expect(timedCircuit.start).toHaveBeenCalledWith(
      expect.objectContaining({
        phases: [expect.not.objectContaining({ durationSeconds: expect.anything() })],
      }),
    )

    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded() })
    await vi.advanceTimersByTimeAsync(1000)

    expect(await screen.findByText('Active time')).toBeVisible()
    expect(screen.getByText('Runs until you end it')).toBeVisible()
    // Two minutes of active time, counted up rather than down.
    expect(screen.getByText(/^2:0\d$/)).toBeVisible()
    expect(screen.queryByText(/Round/)).not.toBeInTheDocument()
  })

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

  it('saves a session started from an exercise without asking which one it was', async () => {
    vi.mocked(getExercise).mockResolvedValue({ exercise: bike } as never)
    vi.mocked(timedCircuit.read).mockResolvedValue({ recording: recorded({ endedAt: 1_120_000 }) })
    vi.mocked(createWorkout).mockResolvedValue({ workoutId: 'saved' } as never)
    renderWithProviders(<RecordSession />, { route: '/record?exercise=bike' })

    await waitFor(() => expect(createWorkout).toHaveBeenCalledOnce())
    expect(screen.queryByText('What was this?')).not.toBeInTheDocument()
  })

  it('reads location refusal as a reason rather than as a recording failure', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(timedCircuit.start).mockRejectedValue(new Error('LOCATION_DENIED'))
    renderWithProviders(<RecordSession />)

    await user.click(await screen.findByRole('button', { name: 'Start recording' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Location access is needed')
  })
})
