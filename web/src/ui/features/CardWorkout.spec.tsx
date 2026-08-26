// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  deleteWorkout: vi.fn(),
  postWorkoutComment: vi.fn(),
}))

import * as requests from '@/http/requests'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
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
const workout = ({ exerciseSets, comments }: Pick<WorkoutInit, 'exerciseSets' | 'comments'> = {}) =>
  create(WorkoutSchema, {
    id: 'workout-1',
    name: 'Push Day',
    intensity: 4200,
    user: { id: ownerId, name: 'Alice Lifter', username: 'alice' },
    exerciseSets,
    comments,
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

    test('leads with the headline numbers', () => {
      render(<CardWorkout compact workout={withSets()} />)

      expect(screen.getByText('4,200 kg')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    test('flags a session that set a personal best', () => {
      render(<CardWorkout compact workout={withSets()} />)

      expect(screen.getByText('New PR')).toBeInTheDocument()
    })

    test('says nothing about records when there were none', () => {
      render(<CardWorkout compact workout={workout()} />)

      expect(screen.queryByText(/\bPRs?\b/)).not.toBeInTheDocument()
    })

    // The feed card stays where it is, so the toast is all there is to see.
    test('announces a deletion on the spot', async () => {
      render(<CardWorkout compact workout={workout()} />)

      await deleteViaMenu()

      await waitFor(() => expect(useToastStore.getState().toast).toMatchObject({ type: 'success' }))
      expect(screen.queryByText('Push Day')).not.toBeInTheDocument()
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

    // The toast has to survive the navigation home that follows.
    test('announces a deletion and goes home', async () => {
      render(<CardWorkout compact={false} workout={workout()} />)

      await deleteViaMenu()

      await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument())
      expect(useToastStore.getState().toast).toMatchObject({ type: 'success' })
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
