import type { Page } from '@playwright/test'

// Every page the router can reach, in the order a reviewer reads them. Entries
// whose route depends on seeded data resolve it at runtime, so a persona that
// owns no routines, plans, or workouts simply skips those pages.
//
// 'component' is the file that renders the page. It travels with the capture so
// that a design note about an image can be taken straight to the source; the
// run reports it as missing rather than guessing when the file has moved.

export type Ids = {
  exerciseId?: string
  followeeId?: string
  planId?: string
  routineId?: string
  userId?: string
  workoutId?: string
}

export type PageEntry = {
  component: string
  name: string
  // Returning undefined marks the page as unreachable for this persona.
  route: (ids: Ids) => string | undefined
  // Opens the state that is only reachable by interacting with the page.
  prepare?: (page: Page) => Promise<void>
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
  { component: 'src/ui/auth/UserLogin.vue', name: 'login', route: () => '/login' },
  { component: 'src/ui/auth/UserSignup.vue', name: 'signup', route: () => '/signup' },
  {
    component: 'src/ui/auth/ForgotPassword.vue',
    name: 'forgot-password',
    route: () => '/forgot-password',
  },
  {
    component: 'src/ui/auth/ResetPassword.vue',
    name: 'reset-password',
    route: () => '/reset-password?token=screenshot-token',
  },
  {
    component: 'src/ui/auth/VerifyEmailPending.vue',
    name: 'verify-email-pending',
    route: () => '/verify-email/pending',
  },
  { component: 'src/ui/NotFound.vue', name: 'not-found', route: () => '/screenshots-has-no-page' },
]

// The workout builders are captured last: opening one saves a workout in
// progress, which every earlier page would otherwise show as a resume banner.
export const authenticatedPages: PageEntry[] = [
  { component: 'src/ui/HomeView.vue', name: 'home', route: () => '/home' },
  {
    component: 'src/ui/notifications/ListNotifications.vue',
    name: 'notifications',
    route: () => '/notifications',
  },
  { component: 'src/ui/ProgressView.vue', name: 'progress', route: () => '/progress' },
  { component: 'src/ui/profile/ProfileView.vue', name: 'profile', route: () => '/profile' },
  {
    component: 'src/ui/users/UserWorkouts.vue',
    name: 'user-workouts',
    route: ({ userId }) => userId && `/users/${userId}`,
  },
  {
    component: 'src/ui/users/UserFollowees.vue',
    name: 'user-follows',
    route: ({ userId }) => userId && `/users/${userId}/follows`,
  },
  {
    component: 'src/ui/users/UserFollowers.vue',
    name: 'user-followers',
    route: ({ userId }) => userId && `/users/${userId}/followers`,
  },
  {
    component: 'src/ui/users/UserPersonalBests.vue',
    name: 'user-personal-bests',
    route: ({ userId }) => userId && `/users/${userId}/personal-bests`,
  },
  {
    component: 'src/ui/users/UserWorkouts.vue',
    name: 'other-user',
    route: ({ followeeId }) => followeeId && `/users/${followeeId}`,
  },
  {
    component: 'src/ui/users/UserView.vue',
    name: 'other-user-actions',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Profile actions' }).click()
      await page.getByRole('menu').waitFor()
    },
    route: ({ followeeId }) => followeeId && `/users/${followeeId}`,
  },
  { component: 'src/ui/workouts/WorkoutView.vue', name: 'workout', route: () => '/workout' },
  {
    component: 'src/ui/workouts/ViewWorkout.vue',
    name: 'view-workout',
    route: ({ workoutId }) => workoutId && `/workouts/${workoutId}`,
  },
  {
    component: 'src/ui/workouts/EditWorkout.vue',
    name: 'edit-workout',
    route: ({ workoutId }) => workoutId && `/workouts/${workoutId}/edit`,
  },
  { component: 'src/ui/plans/PlansView.vue', name: 'plans', route: () => '/plans' },
  { component: 'src/ui/plans/PlanForm.vue', name: 'create-plan', route: () => '/plans/create' },
  {
    component: 'src/ui/plans/ViewPlan.vue',
    name: 'view-plan',
    route: ({ planId }) => planId && `/plans/${planId}`,
  },
  {
    component: 'src/ui/plans/PlanForm.vue',
    name: 'edit-plan',
    route: ({ planId }) => planId && `/plans/${planId}/edit`,
  },
  { component: 'src/ui/routines/ListRoutines.vue', name: 'routines', route: () => '/routines' },
  {
    component: 'src/ui/routines/CreateRoutine.vue',
    name: 'create-routine',
    route: () => '/routines/create',
  },
  {
    component: 'src/ui/routines/ViewRoutine.vue',
    name: 'view-routine',
    route: ({ routineId }) => routineId && `/routines/${routineId}`,
  },
  {
    component: 'src/ui/routines/EditRoutine.vue',
    name: 'edit-routine',
    route: ({ routineId }) => routineId && `/routines/${routineId}/edit`,
  },
  { component: 'src/ui/exercises/ListExercises.vue', name: 'exercises', route: () => '/exercises' },
  {
    component: 'src/ui/exercises/CreateExercise.vue',
    name: 'create-exercise',
    route: () => '/exercises/create',
  },
  {
    component: 'src/ui/exercises/ViewExercise.vue',
    name: 'view-exercise',
    route: ({ exerciseId }) => exerciseId && `/exercises/${exerciseId}`,
  },
  {
    component: 'src/ui/exercises/UpdateExercise.vue',
    name: 'edit-exercise',
    route: ({ exerciseId }) => exerciseId && `/exercises/${exerciseId}/edit`,
  },
  {
    component: 'src/ui/workouts/StartWorkout.vue',
    name: 'quick-workout',
    route: () => '/workouts/quick',
  },
  {
    component: 'src/ui/workouts/StartWorkout.vue',
    name: 'quick-workout-exercise-picker',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Choose exercise' }).click()
      await page.getByPlaceholder('Search').waitFor()
    },
    route: () => '/workouts/quick',
  },
  {
    component: 'src/ui/workouts/StartWorkout.vue',
    name: 'start-routine',
    route: ({ routineId }) => routineId && `/workouts/routine/${routineId}`,
  },
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
