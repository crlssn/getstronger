// @vitest-environment jsdom

import type { ChartData, ChartOptions } from 'chart.js'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

// Chart.js draws to a canvas jsdom does not implement, so the chart's own job
// here is the data it hands over, not the pixels it would paint.
vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data: ChartData<'bar'>; options: ChartOptions<'bar'> } & { role?: string }) => (
    <div
      role={props.role}
      aria-label={(props as { 'aria-label'?: string })['aria-label']}
      data-labels={JSON.stringify(props.data.labels)}
      data-values={JSON.stringify(props.data.datasets[0]?.data)}
      data-colours={JSON.stringify(props.data.datasets[0]?.backgroundColor)}
    />
  ),
}))

import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { renderWithProviders } from '@/ui/testing'
import { WorkoutChart } from './WorkoutChart'

const workout = (finishedAt: string, intensity: number) =>
  create(WorkoutSchema, { intensity, finishedAt: timestampFromDate(new Date(finishedAt)) })

const chart = () => screen.getByRole('img')
const attribute = (name: string) => JSON.parse(chart().getAttribute(name) ?? 'null') as unknown

describe('WorkoutChart', () => {
  test('plots one bar per day, oldest first', () => {
    renderWithProviders(
      <WorkoutChart
        workouts={[
          workout('2026-08-15T08:00:00Z', 200),
          workout('2026-08-14T08:00:00Z', 100),
          workout('2026-08-14T18:00:00Z', 50),
        ]}
      />,
    )

    expect(attribute('data-labels')).toEqual(['14 Aug', '15 Aug'])
    expect(attribute('data-values')).toEqual([150, 200])
  })

  // The most recent day is the story the card is telling, so it is the one bar
  // that is not the default ink.
  test('picks the latest bar out from the rest', () => {
    renderWithProviders(
      <WorkoutChart
        workouts={[workout('2026-08-14T08:00:00Z', 100), workout('2026-08-15T08:00:00Z', 200)]}
      />,
    )

    const colours = attribute('data-colours') as string[]
    expect(colours).toHaveLength(2)
    expect(colours[0]).not.toBe(colours[1])
  })

  test('describes itself to a screen reader', () => {
    renderWithProviders(<WorkoutChart workouts={[workout('2026-08-14T08:00:00Z', 100)]} />)

    expect(chart()).toHaveAccessibleName('Training volume by day')
  })
})
