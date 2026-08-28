// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getUser: vi.fn(),
  listWorkouts: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  listFollowers: vi.fn(),
  listFollowees: vi.fn(),
  getPersonalBests: vi.fn(),
}))

vi.mock('react-chartjs-2', () => ({ Bar: () => <div role="img" aria-label="trend" /> }))

import * as requests from '@/http/requests'
import { GetPersonalBestsResponseSchema } from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import {
  FollowUserResponseSchema,
  GetUserResponseSchema,
  ListFolloweesResponseSchema,
  ListFollowersResponseSchema,
  UnfollowUserResponseSchema,
} from '@/proto/api/v1/user_service_pb'
import { ListWorkoutsResponseSchema } from '@/proto/api/v1/workout_service_pb'
import { useAuthStore } from '@/stores/auth'
import { usePageNavActionStore } from '@/stores/pageNavAction'
import { usePageTitleStore } from '@/stores/pageTitle'
import { renderWithProviders } from '@/ui/testing'
import { UserFollowees } from './UserFollowees'
import { UserFollowers } from './UserFollowers'
import { UserPersonalBests } from './UserPersonalBests'
import { UserView } from './UserView'
import { UserWorkouts } from './UserWorkouts'

const mocked = {
  getUser: vi.mocked(requests.getUser),
  listWorkouts: vi.mocked(requests.listWorkouts),
  followUser: vi.mocked(requests.followUser),
  unfollowUser: vi.mocked(requests.unfollowUser),
  listFollowers: vi.mocked(requests.listFollowers),
  listFollowees: vi.mocked(requests.listFollowees),
  getPersonalBests: vi.mocked(requests.getPersonalBests),
}

const me = 'user-me'
const them = 'user-them'

const profile = (followed = false, id = them) =>
  create(GetUserResponseSchema, {
    user: { id, name: 'Alex Morgan', username: 'alex', followed },
  })

const workout = (id: string, finishedAt: string) => ({
  id,
  name: `Workout ${id}`,
  finishedAt: timestampFromDate(new Date(finishedAt)),
  user: { id: them, username: 'alex' },
})

const workoutsPage = (workouts: ReturnType<typeof workout>[], nextPageToken = new Uint8Array(0)) =>
  create(ListWorkoutsResponseSchema, { workouts, pagination: { nextPageToken } })

const render = (route = `/users/${them}`) =>
  renderWithProviders(
    <Routes>
      <Route path="/users/:id" element={<UserView />}>
        <Route index element={<UserWorkouts />} />
        <Route path="personal-bests" element={<UserPersonalBests />} />
        <Route path="follows" element={<UserFollowees />} />
        <Route path="followers" element={<UserFollowers />} />
      </Route>
    </Routes>,
    { route },
  )

beforeEach(() => {
  Object.values(mocked).forEach((mock) => mock.mockReset())
  mocked.getUser.mockResolvedValue(profile())
  mocked.listWorkouts.mockResolvedValue(workoutsPage([]))
  mocked.followUser.mockResolvedValue(create(FollowUserResponseSchema, {}))
  mocked.unfollowUser.mockResolvedValue(create(UnfollowUserResponseSchema, {}))
  mocked.listFollowers.mockResolvedValue(create(ListFollowersResponseSchema, {}))
  mocked.listFollowees.mockResolvedValue(create(ListFolloweesResponseSchema, {}))
  mocked.getPersonalBests.mockResolvedValue(create(GetPersonalBestsResponseSchema, {}))
  useAuthStore.setState({ userId: me })

  const slot = document.createElement('div')
  document.body.append(slot)
  usePageNavActionStore.setState({ container: slot })
})

afterEach(() => {
  usePageNavActionStore.setState({ container: null })
})

describe('UserView', () => {
  test('titles the page after whoever is being looked at', async () => {
    render()

    await waitFor(() => expect(usePageTitleStore.getState().pageTitle).toBe('Alex Morgan'))
  })

  // Not your own name read back to you — and not "Me" either, which is the tab
  // this screen is not. One name across both left no way to tell from the
  // header which of them you had open.
  test('titles your own profile as the public one it is', async () => {
    mocked.getUser.mockResolvedValue(profile(false, me))
    render(`/users/${me}`)

    await waitFor(() =>
      expect(usePageTitleStore.getState().pageTitle).toBe('Your public profile'),
    )
  })

  test('links each tab to its section', async () => {
    render()

    const tabs = await screen.findByRole('navigation', { name: 'Profile sections' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      `/users/${them}`,
      `/users/${them}/personal-bests`,
      `/users/${them}/follows`,
      `/users/${them}/followers`,
    ])
  })

  test('marks the tab being read as the current page', async () => {
    render(`/users/${them}/followers`)

    const tabs = await screen.findByRole('navigation', { name: 'Profile sections' })
    expect(within(tabs).getByRole('link', { name: 'Followers' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(tabs).getByRole('link', { name: 'Workouts' })).not.toHaveAttribute('aria-current')
  })

  describe('following', () => {
    test('offers to follow someone you do not', async () => {
      render()

      await userEvent.click(await screen.findByRole('button', { name: /Follow Alex Morgan/ }))

      expect(mocked.followUser).toHaveBeenCalledWith(them)
      // Refetched, so the button becomes the unfollow menu without a reload.
      await waitFor(() => expect(mocked.getUser).toHaveBeenCalledTimes(2))
    })

    test('offers to unfollow someone you do, from the nav menu', async () => {
      mocked.getUser.mockResolvedValue(profile(true))
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Profile actions' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: /Unfollow Alex Morgan/ }))

      await waitFor(() => expect(mocked.unfollowUser).toHaveBeenCalledWith(them))
    })

    // Following yourself is not a thing, so neither control belongs there.
    test('offers neither on your own profile', async () => {
      mocked.getUser.mockResolvedValue(profile(false, me))
      render(`/users/${me}`)

      await screen.findByRole('navigation', { name: 'Profile sections' })
      expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Profile actions' })).not.toBeInTheDocument()
    })
  })

  describe('the trend chart', () => {
    // One point is a dot, not a direction — and as a chart it was a single bar
    // filling the whole card in solid green.
    test('reads one logged day as a figure rather than a chart', async () => {
      mocked.listWorkouts.mockResolvedValue(workoutsPage([workout('w1', '2026-08-14T08:00:00Z')]))
      render()

      await screen.findByRole('navigation', { name: 'Profile sections' })
      expect(screen.queryByRole('img', { name: 'trend' })).not.toBeInTheDocument()
      expect(screen.getByText('Only day logged in this range')).toBeInTheDocument()
    })

    test('still reads two as figures', async () => {
      mocked.listWorkouts.mockResolvedValue(
        workoutsPage([
          workout('w1', '2026-08-14T08:00:00Z'),
          workout('w2', '2026-08-13T08:00:00Z'),
        ]),
      )
      render()

      await screen.findByRole('navigation', { name: 'Profile sections' })
      expect(screen.queryByRole('img', { name: 'trend' })).not.toBeInTheDocument()
    })

    test('draws the chart once three days have a shape', async () => {
      mocked.listWorkouts.mockResolvedValue(
        workoutsPage([
          workout('w1', '2026-08-14T08:00:00Z'),
          workout('w2', '2026-08-13T08:00:00Z'),
          workout('w3', '2026-08-12T08:00:00Z'),
        ]),
      )
      render()

      expect(await screen.findByRole('img', { name: 'trend' })).toBeInTheDocument()
    })
  })
})

describe('UserWorkouts', () => {
  test('lists the workouts on the profile', async () => {
    mocked.listWorkouts.mockResolvedValue(workoutsPage([workout('w1', '2026-08-14T08:00:00Z')]))
    render()

    expect(await screen.findByRole('heading', { name: 'Workout w1' })).toBeInTheDocument()
  })

  test('says so when there are none', async () => {
    render()

    expect(await screen.findByText('Nothing here yet…')).toBeInTheDocument()
  })

  // A profile with fifty workouts and no connection used to read as a profile
  // with no workouts.
  test('says the fetch failed rather than that the profile is empty', async () => {
    mocked.listWorkouts.mockResolvedValue(undefined)
    render()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('Nothing here yet…')).not.toBeInTheDocument()

    mocked.listWorkouts.mockResolvedValue(workoutsPage([workout('w1', '2026-08-14T08:00:00Z')]))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Workout w1' })).toBeInTheDocument()
  })
})

describe('UserPersonalBests', () => {
  test('lists each best, linked to its exercise', async () => {
    mocked.getPersonalBests.mockResolvedValue(
      create(GetPersonalBestsResponseSchema, {
        personalBests: [
          {
            exercise: {
              id: 'bench',
              name: 'Bench press',
              tags: ['Chest'],
              metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
            },
            set: { id: 'set-1', weight: 100, reps: 5 },
          },
        ],
      }),
    )
    render(`/users/${them}/personal-bests`)

    const row = await screen.findByRole('link', { name: /Bench press/ })
    expect(row).toHaveAttribute('href', '/exercises/bench')
    expect(row).toHaveTextContent('100 kg · 5')
    expect(row).toHaveTextContent('Chest')
  })

  test('says so when there are none', async () => {
    render(`/users/${them}/personal-bests`)

    expect(await screen.findByText('Nothing here yet…')).toBeInTheDocument()
  })

  test('says the fetch failed rather than that there are no bests', async () => {
    mocked.getPersonalBests.mockResolvedValue(undefined)
    render(`/users/${them}/personal-bests`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('Nothing here yet…')).not.toBeInTheDocument()
  })
})

// The two tabs differ only in which request they make, so they share a list.
describe.each([
  ['followers', 'followers', () => mocked.listFollowers, ListFollowersResponseSchema, 'followers'],
  ['follows', 'followees', () => mocked.listFollowees, ListFolloweesResponseSchema, 'followees'],
] as const)('the %s tab', (path, _name, mock, schema, field) => {
  test('lists each person, linked to their profile', async () => {
    mock().mockResolvedValue(
      create(schema, { [field]: [{ id: 'user-1', username: 'sam', name: 'Sam Doe' }] }),
    )
    render(`/users/${them}/${path}`)

    const row = await screen.findByRole('link', { name: /sam/ })
    expect(row).toHaveAttribute('href', '/users/user-1')
    expect(row).toHaveTextContent('Sam Doe')
  })

  test('says so when there is nobody', async () => {
    render(`/users/${them}/${path}`)

    expect(await screen.findByText('Nothing here yet…')).toBeInTheDocument()
  })

  test('says the fetch failed, and retries it', async () => {
    mock().mockResolvedValue(undefined)
    render(`/users/${them}/${path}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('Nothing here yet…')).not.toBeInTheDocument()

    mock().mockResolvedValue(
      create(schema, { [field]: [{ id: 'user-1', username: 'sam', name: 'Sam Doe' }] }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('link', { name: /sam/ })).toBeInTheDocument()
  })
})
