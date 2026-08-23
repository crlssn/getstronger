// @vitest-environment jsdom

import type { ChartData } from 'chart.js'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

// Chart.js needs a canvas jsdom does not implement. The chart's own contract is
// covered in WorkoutChart.spec; here it only has to report what it was given.
vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data: ChartData<'bar'> }) => (
    <div role="img" aria-label="chart" data-values={JSON.stringify(props.data.datasets[0]?.data)} />
  ),
}))

import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { GetDashboardResponseSchema } from '@/proto/api/v1/routine_service_pb'
import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { useDashboardStore } from '@/stores/dashboard'
import { useProgressStore } from '@/stores/progress'
import { renderWithProviders } from '@/ui/testing'
import { ProgressView } from './ProgressView'

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return timestampFromDate(date)
}

const workout = (days: number, intensity: number) =>
  create(WorkoutSchema, { intensity, finishedAt: daysAgo(days) })

const dashboardWith = (personalBests: { name: string; weight: number }[]) =>
  create(GetDashboardResponseSchema, {
    personalBests: personalBests.map(({ name, weight }, index) => ({
      exercise: {
        id: `exercise-${index}`,
        name,
        tags: ['Push'],
        metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      },
      set: { id: `set-${index}`, weight, reps: 5 },
    })),
  })

const seed = (workouts: ReturnType<typeof workout>[], dashboard = dashboardWith([])) => {
  useProgressStore.setState({ workouts, loaded: true, failed: false })
  useDashboardStore.setState({ dashboard, failed: false })
}

const period = (label: string) => screen.getByRole('button', { name: label })
const chartValues = () =>
  JSON.parse(screen.getByRole('img').getAttribute('data-values') ?? '[]') as number[]

describe('ProgressView', () => {
  beforeEach(() => {
    // The screen loads on mount; the stores are seeded directly instead.
    vi.spyOn(useProgressStore.getState(), 'load').mockResolvedValue(undefined)
    vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    useProgressStore.setState({ workouts: [], loaded: false, failed: false })
    useDashboardStore.setState({ dashboard: undefined, failed: false })
  })

  test('waits before showing a card it has no data for', () => {
    renderWithProviders(<ProgressView />)

    expect(screen.queryByText('Training volume')).not.toBeInTheDocument()
    expect(screen.queryByText('Personal records')).not.toBeInTheDocument()
  })

  test('totals the volume of the selected range', async () => {
    seed([workout(1, 1000), workout(60, 5000)])
    renderWithProviders(<ProgressView />)

    // Four weeks by default, so the two-month-old session is out of range.
    await waitFor(() => expect(screen.getByText('1,000 kg')).toBeInTheDocument())

    await userEvent.click(period('3M'))
    expect(screen.getByText('6,000 kg')).toBeInTheDocument()
    expect(chartValues()).toEqual([5000, 1000])
  })

  // Returning to an earlier range, and picking the same one twice, must keep
  // producing that range's data rather than the last one's.
  test('gives every range its own data, in any order', async () => {
    // One workout per bucket, so only 1Y sees all four.
    seed([workout(2, 100), workout(20, 200), workout(60, 300), workout(200, 400)])
    renderWithProviders(<ProgressView />)

    await waitFor(() => expect(chartValues()).toHaveLength(2))

    for (const [label, bars] of [
      ['7D', 1],
      ['4W', 2],
      ['3M', 3],
      ['1Y', 4],
      ['4W', 2],
      ['7D', 1],
      ['7D', 1],
      ['1Y', 4],
    ] as const) {
      await userEvent.click(period(label))
      expect(chartValues()).toHaveLength(bars)
      expect(period(label)).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('marks the selected period for a screen reader', async () => {
    seed([workout(1, 1000)])
    renderWithProviders(<ProgressView />)

    await waitFor(() => expect(period('4W')).toHaveAttribute('aria-pressed', 'true'))
    expect(period('7D')).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(period('7D'))
    expect(period('7D')).toHaveAttribute('aria-pressed', 'true')
    expect(period('4W')).toHaveAttribute('aria-pressed', 'false')
  })

  // An empty range keeps the picker on screen and says so, rather than
  // unmounting the controls the reader needs to get back to a fuller range.
  test('keeps the picker when the chosen range has nothing in it', async () => {
    seed([workout(200, 5000)])
    renderWithProviders(<ProgressView />)

    await waitFor(() => expect(screen.getByText('No workouts in this period.')).toBeInTheDocument())
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(period('1Y')).toBeInTheDocument()

    await userEvent.click(period('1Y'))
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  test('links each personal best to its exercise', async () => {
    seed([workout(1, 1000)], dashboardWith([{ name: 'Bench press', weight: 100 }]))
    renderWithProviders(<ProgressView />)

    const record = await screen.findByRole('link', { name: /Bench press/ })
    expect(record).toHaveAttribute('href', '/exercises/exercise-0')
    expect(record).toHaveTextContent('Push')
  })

  test('offers a first workout when there are no records yet', async () => {
    seed([])
    renderWithProviders(<ProgressView />)

    await waitFor(() => expect(screen.getByText('Nothing to chart yet')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Start workout' })).toHaveAttribute('href', '/workout')
  })

  // The store has always set this flag; the view used to ignore it, so a failed
  // refresh took the whole volume section off the screen without saying a word.
  test('reads the failure flag its store sets', async () => {
    const load = vi.spyOn(useProgressStore.getState(), 'load').mockResolvedValue(undefined)
    useProgressStore.setState({ workouts: [], loaded: true, failed: true })
    useDashboardStore.setState({ dashboard: dashboardWith([{ name: 'Bench press', weight: 100 }]) })
    renderWithProviders(<ProgressView />)

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Something went wrong')

    await userEvent.click(within(failure).getByRole('button'))

    expect(load).toHaveBeenCalled()
  })

  test('says the records failed rather than that there are none', async () => {
    useProgressStore.setState({ workouts: [workout(1, 1000)], loaded: true, failed: false })
    useDashboardStore.setState({ dashboard: undefined, failed: true })
    renderWithProviders(<ProgressView />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('Nothing to chart yet')).not.toBeInTheDocument()
  })

  // A chip that exists to celebrate should not report a zero.
  test('counts personal bests in the nav bar only when there are some', async () => {
    const slot = document.createElement('div')
    slot.id = 'page-nav-action'
    document.body.append(slot)
    const { usePageNavActionStore } = await import('@/stores/pageNavAction')
    usePageNavActionStore.setState({ container: slot })

    seed([workout(1, 1000)])
    const view = renderWithProviders(<ProgressView />)
    await waitFor(() => expect(screen.getByText('Personal records')).toBeInTheDocument())
    expect(slot).toBeEmptyDOMElement()

    view.unmount()
    seed([workout(1, 1000)], dashboardWith([{ name: 'Bench press', weight: 100 }]))
    renderWithProviders(<ProgressView />)

    await waitFor(() => expect(slot).toHaveTextContent('1 personal best'))
    usePageNavActionStore.setState({ container: null })
    slot.remove()
  })
})
