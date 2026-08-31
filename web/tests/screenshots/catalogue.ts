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

// Every audience is photographed once per palette. The dark run opens the
// same pages in a context whose device asks for dark and leaves the app on
// its System default, so it exercises that path end to end — and the harness
// measures contrast and legibility findings in both palettes rather than one.
export const themes = ['light', 'dark'] as const
export type Theme = (typeof themes)[number]

/** 'active' in the light palette, 'active-dark' in the dark one. */
export const audienceName = (name: string, theme: Theme): string =>
  theme === 'light' ? name : `${name}-dark`

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
  { component: 'src/ui/auth/UserLogin.tsx', name: 'login', route: () => '/login' },
  { component: 'src/ui/auth/UserSignup.tsx', name: 'signup', route: () => '/signup' },
  {
    component: 'src/ui/auth/ForgotPassword.tsx',
    name: 'forgot-password',
    route: () => '/forgot-password',
  },
  {
    component: 'src/ui/auth/ResetPassword.tsx',
    name: 'reset-password',
    route: () => '/reset-password?token=screenshot-token',
  },
  {
    component: 'src/ui/auth/VerifyEmailPending.tsx',
    name: 'verify-email-pending',
    route: () => '/verify-email/pending',
  },
  { component: 'src/ui/PrivacyPolicy.tsx', name: 'privacy', route: () => '/privacy' },
  { component: 'src/ui/NotFound.tsx', name: 'not-found', route: () => '/screenshots-has-no-page' },
]

// The workout builders are captured last: opening one saves a workout in
// progress, which every earlier page would otherwise show as a resume banner.
export const authenticatedPages: PageEntry[] = [
  { component: 'src/ui/HomeView.tsx', name: 'home', route: () => '/home' },
  {
    component: 'src/ui/features/RoutineCarousel.tsx',
    name: 'home-switching',
    // Swiped one panel along, which is what the routine row looks like while
    // another routine is being chosen. A drag is the real gesture; the
    // scroller is moved directly because Playwright has no thumb.
    prepare: async (page) => {
      const row = page.getByRole('list', { name: 'Routines to train next' })
      await row.waitFor()
      await row.evaluate((element) => {
        const next = element.children[1] as HTMLElement | undefined
        if (next) element.scrollTo({ left: next.offsetLeft - (element as HTMLElement).offsetLeft })
      })
    },
    route: ({ routineId }) => routineId && '/home',
  },
  {
    component: 'src/ui/notifications/ListNotifications.tsx',
    name: 'notifications',
    route: () => '/notifications',
  },
  { component: 'src/ui/ProgressView.tsx', name: 'progress', route: () => '/progress' },
  { component: 'src/ui/profile/ProfileView.tsx', name: 'profile', route: () => '/profile' },
  {
    component: 'src/ui/profile/UnitSettings.tsx',
    name: 'settings-units',
    route: () => '/settings/units',
  },
  {
    component: 'src/ui/profile/LanguageSettings.tsx',
    name: 'settings-language',
    route: () => '/settings/language',
  },
  {
    component: 'src/ui/profile/AppearanceSettings.tsx',
    name: 'settings-appearance',
    route: () => '/settings/appearance',
  },
  {
    component: 'src/ui/profile/AccountSettings.tsx',
    name: 'settings-account',
    route: () => '/settings/account',
  },
  {
    component: 'src/ui/users/UserWorkouts.tsx',
    name: 'user-workouts',
    route: ({ userId }) => userId && `/users/${userId}`,
  },
  {
    component: 'src/ui/users/UserFollowees.tsx',
    name: 'user-follows',
    route: ({ userId }) => userId && `/users/${userId}/follows`,
  },
  {
    component: 'src/ui/users/UserFollowers.tsx',
    name: 'user-followers',
    route: ({ userId }) => userId && `/users/${userId}/followers`,
  },
  {
    component: 'src/ui/users/UserPersonalBests.tsx',
    name: 'user-personal-bests',
    route: ({ userId }) => userId && `/users/${userId}/personal-bests`,
  },
  {
    component: 'src/ui/users/UserWorkouts.tsx',
    name: 'other-user',
    route: ({ followeeId }) => followeeId && `/users/${followeeId}`,
  },
  {
    component: 'src/ui/users/UserView.tsx',
    name: 'other-user-actions',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Profile actions' }).click()
      await page.getByRole('menu').waitFor()
    },
    route: ({ followeeId }) => followeeId && `/users/${followeeId}`,
  },
  { component: 'src/ui/workouts/WorkoutView.tsx', name: 'workout', route: () => '/workout' },
  {
    component: 'src/ui/workouts/ViewWorkout.tsx',
    name: 'view-workout',
    route: ({ workoutId }) => workoutId && `/workouts/${workoutId}`,
  },
  {
    component: 'src/ui/workouts/EditWorkout.tsx',
    name: 'edit-workout',
    route: ({ workoutId }) => workoutId && `/workouts/${workoutId}/edit`,
  },
  { component: 'src/ui/plans/PlansView.tsx', name: 'plans', route: () => '/plans' },
  { component: 'src/ui/plans/PlanForm.tsx', name: 'create-plan', route: () => '/plans/create' },
  {
    component: 'src/ui/plans/ViewPlan.tsx',
    name: 'view-plan',
    route: ({ planId }) => planId && `/plans/${planId}`,
  },
  {
    component: 'src/ui/plans/PlanForm.tsx',
    name: 'edit-plan',
    route: ({ planId }) => planId && `/plans/${planId}/edit`,
  },
  { component: 'src/ui/routines/ListRoutines.tsx', name: 'routines', route: () => '/routines' },
  {
    component: 'src/ui/routines/CreateRoutine.tsx',
    name: 'create-routine',
    route: () => '/routines/create',
  },
  {
    component: 'src/ui/routines/ViewRoutine.tsx',
    name: 'view-routine',
    route: ({ routineId }) => routineId && `/routines/${routineId}`,
  },
  {
    component: 'src/ui/routines/EditRoutine.tsx',
    name: 'edit-routine',
    route: ({ routineId }) => routineId && `/routines/${routineId}/edit`,
  },
  { component: 'src/ui/exercises/ListExercises.tsx', name: 'exercises', route: () => '/exercises' },
  {
    component: 'src/ui/exercises/CreateExercise.tsx',
    name: 'create-exercise',
    route: () => '/exercises/create',
  },
  {
    component: 'src/ui/exercises/ViewExercise.tsx',
    name: 'view-exercise',
    route: ({ exerciseId }) => exerciseId && `/exercises/${exerciseId}`,
  },
  {
    component: 'src/ui/exercises/UpdateExercise.tsx',
    name: 'edit-exercise',
    route: ({ exerciseId }) => exerciseId && `/exercises/${exerciseId}/edit`,
  },
  {
    component: 'src/ui/workouts/StartWorkout.tsx',
    name: 'quick-workout',
    route: () => '/workouts/quick',
  },
  {
    component: 'src/ui/workouts/StartWorkout.tsx',
    name: 'quick-workout-exercise-picker',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Choose exercise' }).click()
      await page.getByPlaceholder('Search').waitFor()
    },
    route: () => '/workouts/quick',
  },
  {
    component: 'src/ui/workouts/StartWorkout.tsx',
    name: 'start-routine',
    route: ({ routineId }) => routineId && `/workouts/routine/${routineId}`,
  },
  // Last of all, because a refused request leaves the app believing it is
  // offline until the next one succeeds, and the banner that says so would
  // otherwise turn up in the page photographed after this one.
  {
    component: 'src/ui/components/AppErrorState.tsx',
    name: 'load-failed',
    prepare: async (page) => {
      // The offline cache would serve the last good page instead of failing,
      // which is the right behaviour and the wrong screenshot.
      await page.evaluate(() => {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith('offlineCache:')) window.localStorage.removeItem(key)
        }
      })
      await page.route('**/ListExercises', (route) => route.abort())
      await page.reload()
      await page.getByRole('alert').waitFor()
      await page.unroute('**/ListExercises')
    },
    route: () => '/exercises',
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
