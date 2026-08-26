// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { DistanceUnit, ExerciseMetric, SetSchema, WeightUnit } from '@/proto/api/v1/shared_pb'
import { renderWithProviders } from '@/ui/testing'
import { CardWorkoutExercise } from './CardWorkoutExercise'

const set = (fields: MessageInitShape<typeof SetSchema>) => create(SetSchema, fields)

const weightAndReps = [ExerciseMetric.WEIGHT, ExerciseMetric.REPS]
const distanceAndTime = [ExerciseMetric.DISTANCE, ExerciseMetric.TIME]

// The session owns which exercise is open; this stands in for it, and starts
// open because what the tests are about is the table.
const Harness = ({
  startOpen = true,
  ...props
}: Partial<React.ComponentProps<typeof CardWorkoutExercise>> & { startOpen?: boolean }) => {
  const [open, setOpen] = useState(startOpen)

  return (
    <CardWorkoutExercise
      exerciseId="exercise-1"
      name="Bench press"
      metrics={weightAndReps}
      sets={[set({ id: 'set-1', weight: 100, reps: 5 })]}
      open={open}
      onToggle={() => setOpen((shown) => !shown)}
      {...props}
    />
  )
}

const render = (
  props: Partial<React.ComponentProps<typeof CardWorkoutExercise>> & { startOpen?: boolean } = {},
) => renderWithProviders(<Harness {...props} />)

const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent)
const rows = () => screen.getAllByRole('row')
const toggle = () => screen.getByRole('button', { name: /Bench press/ })

describe('CardWorkoutExercise', () => {
  // A six-exercise session was six tables and several screens of near-identical
  // rows, so the sets are one tap away rather than always printed.
  test('opens onto its sets, and folds them away again', async () => {
    render({ startOpen: false })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle())
    expect(screen.getByRole('table', { name: 'Bench press sets' })).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(toggle())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('opens on request from the session it belongs to', () => {
    render()

    expect(screen.getByRole('table', { name: 'Bench press sets' })).toBeInTheDocument()
  })

  // Which exercise is open is the session's business, not the row's.
  test('reports a tap rather than opening itself', async () => {
    const onToggle = vi.fn()
    renderWithProviders(
      <CardWorkoutExercise
        exerciseId="exercise-1"
        name="Bench press"
        metrics={weightAndReps}
        sets={[set({ id: 'set-1', weight: 100, reps: 5 })]}
        open={false}
        onToggle={onToggle}
      />,
    )

    await userEvent.click(toggle())

    expect(onToggle).toHaveBeenCalledOnce()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // The row is the toggle, so the way to the exercise itself is inside it.
  test('offers the exercise it trained', () => {
    render()

    expect(screen.getByRole('link', { name: 'View exercise' })).toHaveAttribute(
      'href',
      '/exercises/exercise-1',
    )
  })

  test('counts its sets on the row', () => {
    render({ sets: [set({ id: 'set-1' }), set({ id: 'set-2' })] })

    expect(toggle()).toHaveTextContent('2 sets')
  })

  // The columns follow what the exercise measures, so a run is never given a
  // weight column and a lift is never given a pace one.
  test('gives a lift weight and reps columns', () => {
    render()

    expect(headers()).toEqual(['Set', 'Weight', 'Reps'])
  })

  test('gives a distance-and-time exercise a pace column of its own', () => {
    render({
      metrics: distanceAndTime,
      sets: [set({ id: 'set-1', distance: 5, durationSeconds: 1500 })],
    })

    expect(headers()).toEqual(['Set', 'Distance', 'Time', 'Pace'])
    expect(rows().at(-1)).toHaveTextContent('5:00 min/km')
  })

  test('leaves the pace blank when a set has no distance to divide', () => {
    render({ metrics: distanceAndTime, sets: [set({ id: 'set-1', durationSeconds: 600 })] })

    expect(rows().at(-1)).toHaveTextContent('—')
  })

  test('labels each value with the unit it was logged in', () => {
    render({
      sets: [set({ id: 'set-1', weight: 100, reps: 5, weightUnit: WeightUnit.POUNDS })],
    })

    expect(rows().at(-1)).toHaveTextContent('lbs')
  })

  test('shows a duration in minutes and seconds rather than raw seconds', () => {
    render({
      metrics: distanceAndTime,
      sets: [
        set({ id: 'set-1', distance: 2, durationSeconds: 754, distanceUnit: DistanceUnit.MILES }),
      ],
    })

    const row = rows().at(-1)
    expect(row).toHaveTextContent('12 min 34 sec')
    expect(row).toHaveTextContent('mi')
  })

  test('numbers the sets for a screen reader', () => {
    render({
      sets: [set({ id: 'set-1', weight: 100, reps: 5 }), set({ id: 'set-2', weight: 90, reps: 8 })],
    })

    expect(screen.getByLabelText('Set 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Set 2')).toBeInTheDocument()
  })

  // The trophy used to replace the number, which made the record set the one
  // row nobody could place. It keeps its number and gains a mark instead.
  test('keeps a record set’s number, and marks the row beside it', () => {
    render({
      sets: [
        set({ id: 'set-1', weight: 100, reps: 5, metadata: { personalBest: true } }),
        set({ id: 'set-2', weight: 90, reps: 8 }),
      ],
    })

    const best = rows()[1]
    expect(within(best!).getByLabelText('Set 1, PR')).toHaveTextContent('1')
    expect(within(best!).getByLabelText('PR')).toBeInTheDocument()
    expect(within(rows()[2]!).queryByLabelText('PR')).not.toBeInTheDocument()
  })

  // What a reader scans the closed list for is which exercises went well.
  test('says on the row when the exercise set a record', () => {
    render({
      startOpen: false,
      sets: [set({ id: 'set-1', weight: 100, reps: 5, metadata: { personalBest: true } })],
    })

    expect(toggle()).toHaveTextContent('PR')
  })
})
