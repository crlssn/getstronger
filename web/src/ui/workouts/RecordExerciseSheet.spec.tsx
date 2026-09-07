import { create } from '@bufbuild/protobuf'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listExercises, listWorkouts } from '@/http/requests'
import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useAuthStore } from '@/stores/auth'
import { renderWithProviders } from '@/ui/testing'
import { RecordExerciseSheet } from './RecordExerciseSheet'

vi.mock('@/http/requests', () => ({ listExercises: vi.fn(), listWorkouts: vi.fn() }))

const exercise = (id: string, name: string, metrics: ExerciseMetric[]) =>
  create(ExerciseSchema, { id, name, metrics })

const run = exercise('run', 'Easy run', [ExerciseMetric.DISTANCE, ExerciseMetric.TIME])
const bike = exercise('bike', 'Bike commute', [ExerciseMetric.DISTANCE, ExerciseMetric.TIME])
const bench = exercise('bench', 'Bench press', [ExerciseMetric.WEIGHT, ExerciseMetric.REPS])

describe('RecordExerciseSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ userId: 'athlete' })
    vi.mocked(listWorkouts).mockResolvedValue({ workouts: [] } as never)
  })

  it('offers what a route measures, most recently trained first, and saves the choice', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    vi.mocked(listExercises).mockResolvedValue({ exercises: [run, bench, bike] } as never)
    vi.mocked(listWorkouts).mockResolvedValue({
      workouts: [{ exerciseSets: [{ exercise: bike }] }],
    } as never)

    renderWithProviders(
      <RecordExerciseSheet
        summary="23:07 · 7.62 km"
        saving={false}
        onSave={save}
        onClose={vi.fn()}
      />,
    )

    const options = await screen.findAllByRole('button', { name: /run|commute|press/i })
    expect(options.map((option) => option.textContent)).toEqual(['Bike commuteRecent', 'Easy run'])

    // Nothing chosen, the button says nothing about what it would save.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Bike commute/ }))
    const saveButton = screen.getByRole('button', { name: 'Save as Bike commute' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)
    expect(save).toHaveBeenCalledWith(bike)
  })

  it('sends an athlete with nothing to record to the exercise they need first', async () => {
    vi.mocked(listExercises).mockResolvedValue({ exercises: [bench] } as never)

    renderWithProviders(
      <RecordExerciseSheet
        summary="0:12 · 0 km"
        saving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText(/measured by distance and time/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create exercise' })).toHaveAttribute(
      'href',
      '/exercises/create',
    )
  })
})
