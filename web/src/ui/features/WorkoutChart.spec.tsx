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
  const daily = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      workout(`2026-08-${String(index + 1).padStart(2, '0')}T08:00:00Z`, 100),
    )

  test('plots one bar per day, oldest first', () => {
    renderWithProviders(
      <WorkoutChart
        workouts={[
          workout('2026-08-15T08:00:00Z', 200),
          workout('2026-08-14T08:00:00Z', 100),
          workout('2026-08-14T18:00:00Z', 50),
          workout('2026-08-16T08:00:00Z', 300),
        ]}
      />,
    )

    expect(attribute('data-labels')).toEqual(['14 Aug', '15 Aug', '16 Aug'])
    expect(attribute('data-values')).toEqual([150, 200, 300])
  })

  // The most recent day is the story the card is telling, so it is the one bar
  // that is not the default ink.
  test('picks the latest bar out from the rest', () => {
    renderWithProviders(<WorkoutChart workouts={daily(3)} />)

    const colours = attribute('data-colours') as string[]
    expect(colours).toHaveLength(3)
    expect(colours[2]).not.toBe(colours[0])
  })

  test('describes itself to a screen reader', () => {
    renderWithProviders(<WorkoutChart workouts={daily(4)} />)

    expect(chart()).toHaveAccessibleName('Training volume by day')
  })

  // A year of training is 52 daily bars in a phone-width card: slivers about
  // 4px wide under a fan of rotated labels.
  describe('once there are more days than bars will fit', () => {
    test('aggregates them into weeks', () => {
      renderWithProviders(<WorkoutChart workouts={daily(28)} />)

      expect((attribute('data-values') as number[]).length).toBeLessThanOrEqual(6)
      expect((attribute('data-values') as number[]).reduce((a, b) => a + b, 0)).toBe(2800)
    })

    test('says which grain it is drawn at', () => {
      renderWithProviders(<WorkoutChart workouts={daily(28)} />)

      expect(chart()).toHaveAccessibleName('Training volume by week')
    })
  })

  // One datum is a statistic, not a trend: a single bar filled the whole card.
  describe('with too few points to be a trend', () => {
    test('reads a lone day as a figure rather than a chart', () => {
      renderWithProviders(<WorkoutChart workouts={[workout('2026-08-14T08:00:00Z', 29447)]} />)

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByText(/29,447/)).toBeInTheDocument()
      expect(screen.getByText(/14 Aug/)).toBeInTheDocument()
    })

    test('still reads two days as figures', () => {
      renderWithProviders(<WorkoutChart workouts={daily(2)} />)

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    // Three points is a shape, so the chart comes back.
    test('draws the chart again at three', () => {
      renderWithProviders(<WorkoutChart workouts={daily(3)} />)

      expect(chart()).toBeInTheDocument()
    })
  })
})
