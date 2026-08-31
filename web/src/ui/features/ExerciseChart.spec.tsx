// @vitest-environment jsdom

import type { ChartData } from 'chart.js'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

// Chart.js draws to a canvas jsdom does not implement, so the chart reports the
// series it was handed instead of painting it.
vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: ChartData<'line'> } & { 'aria-label'?: string }) => (
    <div
      role="img"
      aria-label={props['aria-label']}
      data-values={JSON.stringify(props.data.datasets[0]?.data)}
    />
  ),
}))

import { ExerciseMetric, SetSchema, WeightUnit } from '@/proto/api/v1/shared_pb'
import { renderWithProviders } from '@/ui/testing'
import { ExerciseChart } from './ExerciseChart'

// Spelled out rather than spread: `create` also accepts a built Set, and a
// spread of a partial init matches that overload instead.
interface SetFields {
  weight?: number
  reps?: number
  distance?: number
  durationSeconds?: number
  weightUnit?: WeightUnit
}

const set = (createdAt: string, fields: SetFields = {}) =>
  create(SetSchema, {
    weight: fields.weight,
    reps: fields.reps,
    distance: fields.distance,
    durationSeconds: fields.durationSeconds,
    weightUnit: fields.weightUnit,
    metadata: { createdAt: timestampFromDate(new Date(createdAt)) },
  })

const lift = { metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS] }
const cardio = { metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME] }

const twoDays = [
  set('2026-08-13T08:00:00Z', { weight: 100, reps: 5, distance: 5, durationSeconds: 1500 }),
  set('2026-08-14T08:00:00Z', { weight: 110, reps: 5, distance: 6, durationSeconds: 1800 }),
]

const metrics = () =>
  within(screen.getByRole('group', { name: 'Exercise progress metric' }))
    .getAllByRole('button')
    .map((button) => button.textContent)

const values = () =>
  JSON.parse(screen.getByRole('img').getAttribute('data-values') ?? '[]') as number[]

describe('ExerciseChart', () => {
  // The measures on offer follow what the exercise records, so a run is never
  // asked about its 1RM.
  test('offers a lift the measures a lift has', () => {
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={lift} />)

    expect(metrics()).toEqual(['1RM', 'kg', 'Reps', 'Vol'])
  })

  test('offers a distance-and-time exercise its own measures', () => {
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={cardio} />)

    expect(metrics()).toEqual(['Distance', 'Time', 'Pace'])
  })

  // Pace needs one unambiguous speed per set, which only the exact
  // distance × time pair has.
  test('keeps pace from exercises with any other measure', () => {
    const swim = { metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME, ExerciseMetric.REPS] }
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={swim} />)

    expect(metrics()).not.toContain('Pace')
  })

  test('leads with the estimated 1RM and its latest value', () => {
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={lift} />)

    expect(screen.getByText('Estimated 1RM')).toBeInTheDocument()
    // 110kg × 5 by Epley is a shade over 128kg.
    expect(screen.getByText('128 kg')).toBeInTheDocument()
  })

  test('plots the measure that was picked', async () => {
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={lift} />)

    await userEvent.click(screen.getByRole('button', { name: 'kg' }))

    expect(values()).toEqual([100, 110])
    expect(screen.getByText('110 kg')).toBeInTheDocument()
  })

  test('shows a duration in minutes and seconds rather than raw seconds', async () => {
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={cardio} />)

    await userEvent.click(screen.getByRole('button', { name: 'Time' }))

    expect(screen.getByText('30 min')).toBeInTheDocument()
  })

  // A run is its own result, so the cardio measures plot every set rather
  // than collapsing a day of intervals into its best one.
  test('plots every set of a cardio measure, even within one day', () => {
    const intervals = [
      set('2026-08-14T08:00:00Z', { distance: 0.68, durationSeconds: 240 }),
      set('2026-08-14T08:10:00Z', { distance: 0.74, durationSeconds: 240 }),
    ]
    renderWithProviders(<ExerciseChart sets={intervals} exercise={cardio} />)

    expect(values()).toEqual([0.68, 0.74])
  })

  test('keeps a lift at one point per day', async () => {
    const sameDay = [
      set('2026-08-14T08:00:00Z', { weight: 100, reps: 5 }),
      set('2026-08-14T08:10:00Z', { weight: 80, reps: 5 }),
      set('2026-08-15T08:00:00Z', { weight: 110, reps: 5 }),
    ]
    renderWithProviders(<ExerciseChart sets={sameDay} exercise={lift} />)

    await userEvent.click(screen.getByRole('button', { name: 'kg' }))

    expect(values()).toEqual([100, 110])
  })

  test('shows a sub-kilometre distance in metres', () => {
    const intervals = [
      set('2026-08-14T08:00:00Z', { distance: 0.68, durationSeconds: 240 }),
      set('2026-08-14T08:10:00Z', { distance: 0.74, durationSeconds: 240 }),
    ]
    renderWithProviders(<ExerciseChart sets={intervals} exercise={cardio} />)

    expect(screen.getByText('740 m')).toBeInTheDocument()
  })

  test('shows pace as minutes per kilometre', async () => {
    const intervals = [
      set('2026-08-14T08:00:00Z', { distance: 0.68, durationSeconds: 240 }),
      set('2026-08-14T08:10:00Z', { distance: 0.74, durationSeconds: 240 }),
    ]
    renderWithProviders(<ExerciseChart sets={intervals} exercise={cardio} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pace' }))

    // The latest interval covered 0.74 km in 4 minutes: 5:24 min/km.
    expect(screen.getByText('5:24 min/km')).toBeInTheDocument()
  })

  test('reports the move from the first day to the last', () => {
    renderWithProviders(<ExerciseChart sets={twoDays} exercise={lift} />)

    expect(screen.getByText('+10%')).toBeInTheDocument()
  })

  test('says so rather than reporting a change of zero', () => {
    const flat = [
      set('2026-08-13T08:00:00Z', { weight: 100, reps: 1 }),
      set('2026-08-14T08:00:00Z', { weight: 100, reps: 1 }),
    ]
    renderWithProviders(<ExerciseChart sets={flat} exercise={lift} />)

    expect(screen.getByText('No change')).toBeInTheDocument()
  })

  // A line through a single point says nothing, so the card says what it is
  // waiting for instead.
  test('waits for a second day before drawing a line', () => {
    renderWithProviders(
      <ExerciseChart
        sets={[set('2026-08-14T08:00:00Z', { weight: 100, reps: 5 })]}
        exercise={lift}
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('First result logged')
  })

  test('says there is nothing yet when there is nothing yet', () => {
    renderWithProviders(<ExerciseChart sets={[]} exercise={lift} />)

    expect(screen.getByRole('status')).toHaveTextContent('No results yet')
  })
})
