// @vitest-environment jsdom

import type { RoundRow } from './RoundTable'

import { create } from '@bufbuild/protobuf'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import {
  DistanceUnit,
  ExerciseMetric,
  ExerciseSchema,
  SetSchema,
  WeightUnit,
} from '@/proto/api/v1/shared_pb'
import { renderWithProviders } from '@/ui/testing'
import { RoundTable } from './RoundTable'

const running = create(ExerciseSchema, {
  id: 'exercise-running',
  name: 'Running',
  metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
})

const squat = create(ExerciseSchema, {
  id: 'exercise-squat',
  name: 'Squat',
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
})

const station = (exercise: typeof squat) => ({ key: exercise.id, exercise, restSeconds: 0 })

const renderRound = (rows: RoundRow[], onChange = vi.fn()) => {
  renderWithProviders(
    <RoundTable
      round={2}
      rows={rows}
      activeKey={rows[0]?.station.key}
      weightUnit={WeightUnit.KILOGRAMS}
      distanceUnit={DistanceUnit.KILOMETERS}
      onChange={onChange}
    />,
  )
  return onChange
}

describe('RoundTable', () => {
  // Two exercises in a circuit need not measure the same things, so every row
  // labels its own fields rather than sharing a header.
  test('gives every exercise its own labelled fields for the round', () => {
    renderRound([
      { station: station(running), set: {} },
      { station: station(squat), set: {}, previous: create(SetSchema, { reps: 5, weight: 100 }) },
    ])

    expect(screen.getByRole('textbox', { name: 'Running set 2 distance' })).toHaveAttribute(
      'inputmode',
      'decimal',
    )
    expect(screen.getByRole('textbox', { name: 'Running set 2 time' })).toHaveAttribute(
      'placeholder',
      'm:ss',
    )
    expect(screen.getByRole('textbox', { name: 'Squat set 2 reps' })).toBeVisible()
    expect(screen.getByText('km')).toBeInTheDocument()
    expect(screen.getByText('kg')).toBeInTheDocument()
  })

  test('shows the same round of the last session beside each exercise', () => {
    renderRound([
      { station: station(running), set: {} },
      { station: station(squat), set: {}, previous: create(SetSchema, { reps: 5, weight: 100 }) },
    ])

    expect(screen.getByText('100 kg × 5')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  test('reports each field against the exercise it belongs to', async () => {
    const user = userEvent.setup()
    const onChange = renderRound([{ station: station(running) }, { station: station(squat) }])

    await user.type(screen.getByRole('textbox', { name: 'Running set 2 time' }), '4:30')
    await user.type(screen.getByRole('textbox', { name: 'Squat set 2 weight' }), '1')

    expect(onChange).toHaveBeenCalledWith(station(running), { durationSeconds: 270 })
    expect(onChange).toHaveBeenLastCalledWith(station(squat), { weight: 1 })
  })
})
