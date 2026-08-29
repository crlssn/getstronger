// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  deleteWorkout: vi.fn(),
  postWorkoutComment: vi.fn(),
}))

import * as requests from '@/http/requests'
import { ExerciseMetric, RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import {
  DeleteWorkoutResponseSchema,
  PostCommentResponseSchema,
  WorkoutSchema,
} from '@/proto/api/v1/workout_service_pb'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePageNavActionStore } from '@/stores/pageNavAction'
import { renderWithProviders } from '@/ui/testing'
import { CardWorkout } from './CardWorkout'

const mocked = {
  deleteWorkout: vi.mocked(requests.deleteWorkout),
  postWorkoutComment: vi.mocked(requests.postWorkoutComment),
}

const ownerId = 'user-owner'

type WorkoutInit = MessageInitShape<typeof WorkoutSchema>

// Spelled out rather than spread over a base: `create` also accepts a built
// Workout, and a spread of two partial inits matches that overload instead.
const workout = ({
  exerciseSets,
  comments,
  groups,
}: Pick<WorkoutInit, 'exerciseSets' | 'comments' | 'groups'> = {}) =>
  create(WorkoutSchema, {
    id: 'workout-1',
    name: 'Push Day',
    intensity: 4200,
    user: { id: ownerId, name: 'Alice Lifter', username: 'alice' },
    exerciseSets,
    comments,
    groups,
  })

const withSets = () =>
  workout({
    exerciseSets: [
      {
        exercise: {
          id: 'exercise-1',
          name: 'Bench press',
          metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
        },
        sets: [
          { id: 'set-1', weight: 100, reps: 5, metadata: { personalBest: true } },
          { id: 'set-2', weight: 90, reps: 8 },
        ],
      },
    ],
  })

const lift = (id: string, name: string) => ({
  id,
  name,
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
})

// A warm-up worked straight through, then a circuit taken twice round.
const withBlocks = () =>
  workout({
    exerciseSets: [
      { exercise: lift('exercise-1', 'Bench press'), sets: [{ weight: 40, reps: 10 }] },
      {
        exercise: lift('exercise-2', 'Squat'),
        sets: [
          { weight: 90, reps: 5 },
          { weight: 95, reps: 5 },
        ],
      },
    ],
    groups: [
      {
        id: 'group-warmup',
        mode: RoutineGroupMode.STRAIGHT,
        exercises: [
          { exercise: lift('exercise-1', 'Bench press'), sets: [{ weight: 40, reps: 10 }] },
        ],
      },
      {
        id: 'group-circuit',
        mode: RoutineGroupMode.CIRCUIT,
        rounds: 2,
        exercises: [
          {
            exercise: lift('exercise-2', 'Squat'),
            sets: [
              { weight: 90, reps: 5 },
              { weight: 95, reps: 5 },
            ],
          },
        ],
      },
    ],
  })

const render = (element: React.ReactElement) =>
  renderWithProviders(
    <Routes>
      <Route path="/home" element={<p>home</p>} />
      <Route path="*" element={element} />
    </Routes>,
    { route: '/workouts/workout-1' },
  )

const deleteViaMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Workout actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete workout' }))
  await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
  useConfirmationStore.getState().accept()
}

describe('CardWorkout', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.deleteWorkout.mockResolvedValue(create(DeleteWorkoutResponseSchema, {}))
    useAuthStore.setState({ userId: ownerId })
    useToastStore.getState().dismiss()
    useConfirmationStore.setState({ confirmation: null, resolver: null })

    // The full workout portals its menu into the nav bar's action slot.
    const slot = document.createElement('div')
    document.body.append(slot)
    usePageNavActionStore.setState({ container: slot })
  })

  describe('as a feed card', () => {
    test('is one link to the workout it summarises', () => {
      render(<CardWorkout compact workout={workout()} />)

      expect(screen.getByRole('link', { name: 'View Push Day workout details' })).toHaveAttribute(
        'href',
        '/workouts/workout-1',
      )
    })

    // The session and the account share the title row; the numbers get the
    // line under it. The 2x2 grid cost around 340px a card, so a phone showed
    // one and a half of them.
    test('names the session and the account on one row', () => {
      render(<CardWorkout compact workout={withSets()} />)

      const title = screen.getByRole('heading', { name: 'Push Day' }).closest('div')
      expect(within(title!).getByRole('link', { name: '@alice' })).toBeInTheDocument()
    })

    test('carries the numbers on the line under it', () => {
      render(<CardWorkout compact workout={withSets()} />)

      expect(screen.getByText(/4,200 kg/)).toHaveTextContent(/2 sets/)
    })

    // PRS repeated the badge beside the title, and DURATION was 60 min on
    // nearly every card in a seeded year.
    test('leaves the record count and the duration off the row', () => {
      render(<CardWorkout compact workout={withSets()} />)

      expect(screen.queryByText('Sets logged')).not.toBeInTheDocument()
      expect(screen.queryByText('Duration')).not.toBeInTheDocument()
      expect(screen.queryByText('Personal records')).not.toBeInTheDocument()
    })

    test('flags a session that set a personal best', () => {
      render(<CardWorkout compact workout={withSets()} />)

      expect(screen.getByText('PR')).toBeInTheDocument()
    })

    // The detail page always counts them; what a session with none does not
    // get is the chip that celebrates them.
    test('says nothing about records when there were none', () => {
      render(<CardWorkout compact workout={workout()} />)

      expect(screen.queryByText(/\bPR\b/)).not.toBeInTheDocument()
    })

    // Every card opens the workout, your own included: editing and deleting
    // live in the nav bar once it is open, so the row stays one tap with one
    // meaning.
    test('offers no menu of its own, on anybody’s workout', () => {
      useAuthStore.setState({ userId: 'user-1' })
      render(<CardWorkout compact workout={workout()} />)

      expect(screen.queryByRole('button', { name: 'Workout actions' })).not.toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'View Push Day workout details' }),
      ).toBeInTheDocument()
    })

    test('leaves out the exercises and the comments', () => {
      render(<CardWorkout compact workout={withSets()} />)

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('as the full workout', () => {
    test('lists every exercise with its sets', () => {
      render(<CardWorkout compact={false} workout={withSets()} />)

      // The session opens on its first exercise; the rest are one tap away.
      expect(screen.getByRole('button', { name: /Bench press/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(screen.getByRole('table', { name: /Bench press/ })).toBeInTheDocument()
      expect(screen.getAllByRole('row')).toHaveLength(3)
    })

    // A circuit and a block of straight sets used to read identically once the
    // session was saved, which is the whole reason the workout records them.
    test('reads a grouped session in its blocks', () => {
      render(<CardWorkout compact={false} workout={withBlocks()} />)

      expect(screen.getByText('Group A')).toBeInTheDocument()
      expect(screen.getByText('Straight sets')).toBeInTheDocument()
      // What the session actually did, not what it was prescribed.
      expect(screen.getByText('Circuit · 2 rounds')).toBeInTheDocument()

      // The straight block keeps the accordion; the circuit is read by round.
      expect(screen.getByRole('button', { name: /Bench press/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument()
      expect(screen.getByText('95 kg × 5')).toBeInTheDocument()
    })

    // A plain routine, a quick workout, and every session logged before blocks
    // were recorded: one list, no badges.
    test('reads an ungrouped session as the flat list it always was', () => {
      render(<CardWorkout compact={false} workout={withSets()} />)

      expect(screen.queryByText('Group A')).not.toBeInTheDocument()
      expect(screen.getByRole('table', { name: /Bench press/ })).toBeInTheDocument()
    })

    // The toast has to survive the navigation home that follows.
    test('announces a deletion and goes home', async () => {
      render(<CardWorkout compact={false} workout={workout()} />)

      await deleteViaMenu()

      await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument())
      expect(useToastStore.getState().toast).not.toBeNull()
    })

    test('does nothing when the deletion is declined', async () => {
      render(<CardWorkout compact={false} workout={workout()} />)

      await userEvent.click(screen.getByRole('button', { name: 'Workout actions' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete workout' }))
      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
      useConfirmationStore.getState().dismiss()

      await waitFor(() => expect(mocked.deleteWorkout).not.toHaveBeenCalled())
      expect(useToastStore.getState().toast).toBeNull()
    })

    test('offers no menu on a workout that is not yours', () => {
      useAuthStore.setState({ userId: 'someone-else' })
      render(<CardWorkout compact={false} workout={workout()} />)

      expect(screen.queryByRole('button', { name: 'Workout actions' })).not.toBeInTheDocument()
    })

    test('posts a comment and shows it straight away', async () => {
      mocked.postWorkoutComment.mockResolvedValue(
        create(PostCommentResponseSchema, {
          comment: {
            id: 'comment-1',
            comment: 'Strong session',
            user: { id: 'u2', username: 'bo' },
          },
        }),
      )
      useAuthStore.setState({ userId: 'someone-else' })
      render(<CardWorkout compact={false} workout={workout()} />)

      const field = screen.getByRole('textbox')
      await userEvent.type(field, 'Strong session')
      await userEvent.click(screen.getByRole('button', { name: 'Post comment' }))

      expect(mocked.postWorkoutComment).toHaveBeenCalledWith('workout-1', 'Strong session')
      expect(await screen.findByText('Strong session')).toBeInTheDocument()
      expect(field).toHaveValue('')
    })

    test('will not post an empty comment', async () => {
      useAuthStore.setState({ userId: 'someone-else' })
      render(<CardWorkout compact={false} workout={workout()} />)

      expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled()

      await userEvent.type(screen.getByRole('textbox'), '   ')
      expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled()
    })

    // The owner has nothing to say to themselves on an empty thread; anyone
    // else is looking at the way to say something.
    test('hides an empty comment thread from the owner only', () => {
      const { unmount } = render(<CardWorkout compact={false} workout={workout()} />)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      unmount()

      useAuthStore.setState({ userId: 'someone-else' })
      render(<CardWorkout compact={false} workout={workout()} />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    test('shows an existing thread to the owner', () => {
      render(
        <CardWorkout
          compact={false}
          workout={workout({
            comments: [{ id: 'c1', comment: 'Nice one', user: { id: 'u2', username: 'bo' } }],
          })}
        />,
      )

      expect(screen.getByText('Nice one')).toBeInTheDocument()
    })
  })
})
