import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { timedCircuit } from '@/native/timedCircuit'
import { renderWithProviders } from '@/ui/testing'
import type { Recording } from '@/utils/timedCircuit'
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
    await user.click(screen.getByRole('button', { name: 'End early and review' }))
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ endedAt: expect.any(Number) }),
      ),
    )
    expect(screen.getByRole('heading', { name: 'Workout route' })).toBeVisible()
  })
})
