import type { Page } from '@playwright/test'

// Every page the router can reach, in the order a reviewer reads them. Entries
// whose path depends on seeded data resolve it at runtime, so a persona that
// owns no routines, plans, or workouts simply skips those pages.

export type Ids = {
  exerciseId?: string
  followeeId?: string
  planId?: string
  routineId?: string
  userId?: string
  workoutId?: string
}

export type PageEntry = {
  // Returning undefined marks the page as unreachable for this persona.
  path: (ids: Ids) => string | undefined
  name: string
}

export type Persona = {
  description: string
  email: string
  name: string
  password: string
}

const password = process.env.USER_PASSWORD ?? 'password123'

export const personas: Persona[] = [
  {
    description: 'The established account seeded with a year of training',
    email: process.env.USER_EMAIL ?? 'active@getstronger.test',
    name: 'active',
    password,
  },
  {
    description: 'The freshly signed-up account with no data of its own',
    email: process.env.NEW_USER_EMAIL ?? 'new@getstronger.test',
    name: 'new',
    password: process.env.NEW_USER_PASSWORD ?? password,
  },
]

export const guestPages: PageEntry[] = [
  { name: 'login', path: () => '/login' },
  { name: 'signup', path: () => '/signup' },
  { name: 'forgot-password', path: () => '/forgot-password' },
  { name: 'reset-password', path: () => '/reset-password?token=screenshot-token' },
  { name: 'verify-email-pending', path: () => '/verify-email/pending' },
  { name: 'not-found', path: () => '/screenshots-has-no-such-page' },
]

// The two workout builders are captured last: opening one saves a workout in
// progress, which every earlier page would otherwise show as a resume banner.
export const authenticatedPages: PageEntry[] = [
  { name: 'home', path: () => '/home' },
  { name: 'notifications', path: () => '/notifications' },
  { name: 'progress', path: () => '/progress' },
  { name: 'profile', path: () => '/profile' },
  { name: 'user-workouts', path: ({ userId }) => userId && `/users/${userId}` },
  { name: 'user-follows', path: ({ userId }) => userId && `/users/${userId}/follows` },
  { name: 'user-followers', path: ({ userId }) => userId && `/users/${userId}/followers` },
  {
    name: 'user-personal-bests',
    path: ({ userId }) => userId && `/users/${userId}/personal-bests`,
  },
  { name: 'other-user', path: ({ followeeId }) => followeeId && `/users/${followeeId}` },
  { name: 'workout', path: () => '/workout' },
  { name: 'view-workout', path: ({ workoutId }) => workoutId && `/workouts/${workoutId}` },
  { name: 'edit-workout', path: ({ workoutId }) => workoutId && `/workouts/${workoutId}/edit` },
  { name: 'plans', path: () => '/plans' },
  { name: 'create-plan', path: () => '/plans/create' },
  { name: 'view-plan', path: ({ planId }) => planId && `/plans/${planId}` },
  { name: 'edit-plan', path: ({ planId }) => planId && `/plans/${planId}/edit` },
  { name: 'routines', path: () => '/routines' },
  { name: 'create-routine', path: () => '/routines/create' },
  { name: 'view-routine', path: ({ routineId }) => routineId && `/routines/${routineId}` },
  { name: 'edit-routine', path: ({ routineId }) => routineId && `/routines/${routineId}/edit` },
  { name: 'exercises', path: () => '/exercises' },
  { name: 'create-exercise', path: () => '/exercises/create' },
  { name: 'view-exercise', path: ({ exerciseId }) => exerciseId && `/exercises/${exerciseId}` },
  {
    name: 'edit-exercise',
    path: ({ exerciseId }) => exerciseId && `/exercises/${exerciseId}/edit`,
  },
  { name: 'quick-workout', path: () => '/workouts/quick' },
  { name: 'start-routine', path: ({ routineId }) => routineId && `/workouts/routine/${routineId}` },
]

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// Identifiers are read off the links the app itself renders rather than out of
// the database, so the tool keeps working when the seed changes.
export const resolveIds = async (
  page: Page,
  settle: (page: Page) => Promise<void>,
): Promise<Ids> => {
  const idsOn = async (path: string, collection: string) => {
    await page.goto(path)
    await settle(page)
    const pattern = new RegExp(`^/${collection}/(${uuid})$`)
    const hrefs = await page
      .locator(`a[href^="/${collection}/"]`)
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))

    return hrefs.map((href) => pattern.exec(href)?.[1]).filter((id) => id !== undefined)
  }

  const [userId] = await idsOn('/profile', 'users')
  const [workoutId] = await idsOn('/workout', 'workouts')
  const [routineId] = await idsOn('/routines', 'routines')
  const [exerciseId] = await idsOn('/exercises', 'exercises')
  const [planId] = await idsOn('/plans', 'plans')
  const followees = userId ? await idsOn(`/users/${userId}/follows`, 'users') : []

  return {
    exerciseId,
    followeeId: followees.find((id) => id !== userId),
    planId,
    routineId,
    userId,
    workoutId,
  }
}
