// @vitest-environment jsdom

import type { Set } from '@/proto/api/v1/shared_pb'

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { DistanceUnit, ExerciseMetric, SetSchema, WeightUnit } from '@/proto/api/v1/shared_pb'
import { renderWithProviders } from '@/ui/testing'
import { CardWorkoutExercise } from './CardWorkoutExercise'

const set = (fields: MessageInitShape<typeof SetSchema>) => create(SetSchema, fields)

const weightAndReps = [ExerciseMetric.WEIGHT, ExerciseMetric.REPS]
const distanceAndTime = [ExerciseMetric.DISTANCE, ExerciseMetric.TIME]

const render = (props: Partial<React.ComponentProps<typeof CardWorkoutExercise>> = {}) =>
  renderWithProviders(
    <CardWorkoutExercise
      exerciseId="exercise-1"
      name="Bench press"
      metrics={weightAndReps}
      sets={[set({ id: 'set-1', weight: 100, reps: 5 })]}
      {...props}
    />,
  )

const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent)
const rows = () => screen.getAllByRole('row')

describe('CardWorkoutExercise', () => {
  test('links its name to the exercise', () => {
    render()

    expect(screen.getByRole('link', { name: 'Bench press' })).toHaveAttribute(
      'href',
      '/exercises/exercise-1',
    )
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
        set({ id: 'set-1', distance: 2, durationSeconds: 605, distanceUnit: DistanceUnit.MILES }),
      ],
    })

    const row = rows().at(-1)
    expect(row).toHaveTextContent('10 min 5 sec')
    expect(row).toHaveTextContent('mi')
  })

  test('numbers the sets for a screen reader', () => {
    render({
      sets: [set({ id: 'set-1', weight: 100, reps: 5 }), set({ id: 'set-2', weight: 90, reps: 8 })],
    })

    expect(screen.getByLabelText('Set 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Set 2')).toBeInTheDocument()
  })

  test('replaces a best set’s number with a trophy, and says so', () => {
    render({
      sets: [set({ id: 'set-1', weight: 100, reps: 5, metadata: { personalBest: true } })],
    })

    const marker = screen.getByLabelText('Set 1, personal best')
    expect(marker).toHaveTextContent('')
    expect(marker.querySelector('svg')).toBeInTheDocument()
  })

  describe('compact', () => {
    const compactSets: Set[] = [
      set({ id: 'set-1', weight: 100, reps: 5, metadata: { personalBest: true } }),
      set({ id: 'set-2', weight: 90, reps: 8 }),
    ]

    test('drops the header row and puts each set on one line', () => {
      render({ compact: true, sets: compactSets })

      expect(screen.queryAllByRole('columnheader')).toHaveLength(0)
      expect(rows()).toHaveLength(2)
      expect(rows()[0]).toHaveTextContent('100 kg · 5')
    })

    // There is no room to swap the number out, so the best keeps its number and
    // gains a badge beside it.
    test('keeps the set number and adds a badge for a best', () => {
      render({ compact: true, sets: compactSets })

      const best = rows()[0]
      expect(best).toHaveTextContent('1')
      expect(within(best!).getByRole('img', { name: 'Personal best' })).toBeInTheDocument()
      expect(within(rows()[1]!).queryByRole('img')).not.toBeInTheDocument()
    })

    test('leaves out the set count that the full table carries', () => {
      render({ compact: true, sets: compactSets })

      expect(screen.queryByText('2 sets')).not.toBeInTheDocument()
    })
  })

  test('counts its sets when it is not compact', () => {
    render({ sets: [set({ id: 'set-1' }), set({ id: 'set-2' })] })

    expect(screen.getByText('2 sets')).toBeInTheDocument()
  })
})
