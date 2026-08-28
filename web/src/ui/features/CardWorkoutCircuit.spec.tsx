// @vitest-environment jsdom

import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { create } from '@bufbuild/protobuf'
import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { WorkoutGroupExerciseSchema } from '@/proto/api/v1/workout_service_pb'
import { renderWithProviders } from '@/ui/testing'
import { CardWorkoutCircuit } from './CardWorkoutCircuit'

const trained = (name: string, sets: { weight: number; reps: number }[]) =>
  create(WorkoutGroupExerciseSchema, {
    exercise: create(ExerciseSchema, {
      id: name,
      name,
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
    }),
    sets,
  })

const round = (label: string) => screen.getByRole('heading', { name: label }).parentElement!

describe('CardWorkoutCircuit', () => {
  test('reads the block round by round rather than exercise by exercise', () => {
    renderWithProviders(
      <CardWorkoutCircuit
        exercises={[
          trained('Bench', [
            { weight: 60, reps: 8 },
            { weight: 65, reps: 6 },
          ]),
          trained('Squat', [
            { weight: 90, reps: 5 },
            { weight: 95, reps: 5 },
          ]),
        ]}
      />,
    )

    expect(screen.getAllByRole('heading')).toHaveLength(2)
    expect(within(round('Round 1')).getByText('60 kg · 8')).toBeInTheDocument()
    expect(within(round('Round 2')).getByText('95 kg · 5')).toBeInTheDocument()
  })

  // The block ran for as many rounds as its longest-worked exercise; an athlete
  // who dropped one part-way leaves a gap rather than shifting the rows.
  test('says nothing was taken where an exercise stopped short', () => {
    renderWithProviders(
      <CardWorkoutCircuit
        exercises={[
          trained('Bench', [
            { weight: 60, reps: 8 },
            { weight: 65, reps: 6 },
          ]),
          trained('Squat', [{ weight: 90, reps: 5 }]),
        ]}
      />,
    )

    expect(within(round('Round 2')).getByText('—')).toBeInTheDocument()
  })

  test('renders nothing for a block that logged no sets', () => {
    renderWithProviders(<CardWorkoutCircuit exercises={[trained('Bench', [])]} />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
