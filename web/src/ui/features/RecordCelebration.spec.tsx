// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { AppButton } from '@/ui/components/AppButton'
import { renderWithProviders } from '@/ui/testing'
import { RecordCelebration } from './RecordCelebration'

const lift = (name: string, weight: number, personalBest = true) => ({
  exercise: { id: name, name, metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS] },
  sets: [
    { id: `${name}-1`, weight: weight - 10, reps: 5 },
    { id: `${name}-2`, weight, reps: 5, metadata: { personalBest } },
  ],
})

const workoutWith = (...exerciseSets: ReturnType<typeof lift>[]) =>
  create(WorkoutSchema, { id: 'workout-1', exerciseSets })

const reducedMotion = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  reducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RecordCelebration', () => {
  test('leads with the first record and counts the rest', () => {
    renderWithProviders(
      <RecordCelebration
        workout={workoutWith(lift('Bench press', 100), lift('Row', 80, false), lift('Squat', 140))}
        playing
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByText('2 new PRs', { selector: '[aria-live]' })).toBeInTheDocument()
    expect(screen.getByText('New personal record')).toBeInTheDocument()
    expect(screen.getByText('100 kg × 5')).toBeInTheDocument()
    expect(screen.getByText('Bench press')).toBeInTheDocument()
    expect(screen.getByText('+1 more record')).toBeInTheDocument()
    expect(screen.queryByText('Squat')).not.toBeInTheDocument()
  })

  test('says nothing of more records when there is one', () => {
    renderWithProviders(
      <RecordCelebration
        workout={workoutWith(lift('Bench press', 100))}
        playing
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByText('New PR', { selector: '[aria-live]' })).toBeInTheDocument()
    expect(screen.queryByText(/more record/)).not.toBeInTheDocument()
  })

  test('ends on its own, later when there are several records to light', () => {
    const one = vi.fn()
    const several = vi.fn()
    renderWithProviders(
      <>
        <RecordCelebration workout={workoutWith(lift('Bench press', 100))} playing onDone={one} />
        <RecordCelebration
          workout={workoutWith(lift('Bench press', 100), lift('Squat', 140))}
          playing
          onDone={several}
        />
      </>,
    )

    act(() => void vi.advanceTimersByTime(1500))
    expect(one).toHaveBeenCalledOnce()
    expect(several).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(300))
    expect(several).toHaveBeenCalledOnce()
  })

  // The card covers the screen but the page is live beneath it: a tap is spent
  // skipping, not on whatever it happened to land on.
  test('skips on a tap that does not reach what is beneath it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onDone = vi.fn()
    const beneath = vi.fn()
    renderWithProviders(
      <>
        <AppButton type="button" colour="primary" onClick={beneath}>
          {'Beneath'}
        </AppButton>
        <RecordCelebration
          workout={workoutWith(lift('Bench press', 100))}
          playing
          onDone={onDone}
        />
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Beneath' }))

    expect(onDone).toHaveBeenCalledOnce()
    expect(beneath).not.toHaveBeenCalled()
  })

  test('skips on a scroll', () => {
    const onDone = vi.fn()
    renderWithProviders(
      <RecordCelebration workout={workoutWith(lift('Bench press', 100))} playing onDone={onDone} />,
    )

    fireEvent.scroll(document)

    expect(onDone).toHaveBeenCalledOnce()
  })

  test('shows no card to a reader who asked for less motion, and still announces', async () => {
    reducedMotion(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onDone = vi.fn()
    const beneath = vi.fn()
    renderWithProviders(
      <>
        <AppButton type="button" colour="primary" onClick={beneath}>
          {'Beneath'}
        </AppButton>
        <RecordCelebration
          workout={workoutWith(lift('Bench press', 100))}
          playing
          onDone={onDone}
        />
      </>,
    )

    expect(screen.getByText('New PR', { selector: '[aria-live]' })).toBeInTheDocument()
    expect(screen.queryByText('New personal record')).not.toBeInTheDocument()

    // With no card to skip, a tap is the page's.
    await user.click(screen.getByRole('button', { name: 'Beneath' }))
    expect(beneath).toHaveBeenCalledOnce()

    act(() => void vi.advanceTimersByTime(200))
    expect(onDone).toHaveBeenCalledOnce()
  })

  test('keeps its announcement once over', () => {
    renderWithProviders(
      <RecordCelebration
        workout={workoutWith(lift('Bench press', 100))}
        playing={false}
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByText('New PR', { selector: '[aria-live]' })).toBeInTheDocument()
    expect(screen.queryByText('New personal record')).not.toBeInTheDocument()
  })
})
