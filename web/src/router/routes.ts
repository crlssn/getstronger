/**
 * Every route the app can reach, as data.
 *
 * The table is kept separate from the React Router element tree so the parts
 * that carry decisions — who may see a route, what the header says, whether the
 * chrome is hidden — can be read and tested without mounting a screen.
 * `router.tsx` turns this into routes once the screens exist.
 */
export type RouteAccess =
  /** Signed in, or bounced to /login. */
  | 'auth'
  /** Signed out, or bounced to /home. */
  | 'guest'
  /** Bounced either way; the landing page itself renders nothing. */
  | 'landing'
  /** Anyone. */
  | 'public'

export interface AppRoute {
  name: string
  path: string
  access: RouteAccess
  /** A catalogue key, so the header follows the locale. Screens with dynamic
   *  titles carry none and set their own. */
  titleKey?: string
  /** Hides the usual chrome — the quick-workout screens run full-bleed. */
  focusedShell?: boolean
  children?: AppRoute[]
}

export const routes: AppRoute[] = [
  { name: 'home', path: '/home', access: 'auth', titleKey: 'pages.home' },
  {
    name: 'list-notifications',
    path: '/notifications',
    access: 'auth',
    titleKey: 'pages.notifications',
  },
  { name: 'progress', path: '/progress', access: 'auth', titleKey: 'pages.progress' },
  { name: 'profile', path: '/profile', access: 'auth', titleKey: 'pages.profile' },
  {
    name: 'user-view',
    path: '/users/:id',
    access: 'auth',
    children: [
      { name: 'user-workouts', path: '', access: 'auth' },
      { name: 'user-followees', path: 'follows', access: 'auth' },
      { name: 'user-followers', path: 'followers', access: 'auth' },
      { name: 'user-personal-bests', path: 'personal-bests', access: 'auth' },
    ],
  },

  { name: 'workout', path: '/workout', access: 'auth', titleKey: 'pages.workout' },
  {
    name: 'quick-workout',
    path: '/workouts/quick',
    access: 'auth',
    titleKey: 'pages.quickWorkout',
    focusedShell: true,
  },
  { name: 'view-workout', path: '/workouts/:id', access: 'auth' },
  {
    name: 'edit-workout',
    path: '/workouts/:id/edit',
    access: 'auth',
    titleKey: 'pages.editWorkout',
  },
  {
    name: 'workout-routine',
    path: '/workouts/routine/:routine_id',
    access: 'auth',
    focusedShell: true,
  },

  { name: 'plans', path: '/plans', access: 'auth', titleKey: 'pages.training' },
  { name: 'create-plan', path: '/plans/create', access: 'auth', titleKey: 'pages.newPlan' },
  { name: 'plan', path: '/plans/:id', access: 'auth', titleKey: 'pages.plan' },
  { name: 'edit-plan', path: '/plans/:planId/edit', access: 'auth', titleKey: 'pages.editPlan' },

  { name: 'routines', path: '/routines', access: 'auth', titleKey: 'pages.routines' },
  {
    name: 'create-routine',
    path: '/routines/create',
    access: 'auth',
    titleKey: 'pages.createRoutine',
  },
  { name: 'routine', path: '/routines/:id', access: 'auth', titleKey: 'pages.routine' },
  {
    name: 'edit-routine',
    path: '/routines/:id/edit',
    access: 'auth',
    titleKey: 'pages.updateRoutine',
  },

  { name: 'exercises', path: '/exercises', access: 'auth', titleKey: 'pages.exercises' },
  {
    name: 'create-exercise',
    path: '/exercises/create',
    access: 'auth',
    titleKey: 'pages.createExercise',
  },
  {
    name: 'view-exercise',
    path: '/exercises/:id',
    access: 'auth',
    titleKey: 'pages.viewExercise',
  },
  {
    name: 'update-exercise',
    path: '/exercises/:id/edit',
    access: 'auth',
    titleKey: 'pages.updateExercise',
  },

  { name: 'login', path: '/login', access: 'guest', titleKey: 'pages.login' },
  { name: 'signup', path: '/signup', access: 'guest', titleKey: 'pages.createAccount' },
  { name: 'logout', path: '/logout', access: 'auth' },
  { name: 'verify-email', path: '/verify-email', access: 'guest' },
  {
    name: 'verify-email-pending',
    path: '/verify-email/pending',
    access: 'guest',
    titleKey: 'pages.verifyEmail',
  },
  {
    name: 'forgot-password',
    path: '/forgot-password',
    access: 'guest',
    titleKey: 'pages.resetPassword',
  },
  {
    name: 'reset-password',
    path: '/reset-password',
    access: 'guest',
    titleKey: 'pages.chooseNewPassword',
  },

  // TODO: Create a landing page.
  { name: 'landing', path: '/', access: 'landing' },
  { name: 'not-found', path: '*', access: 'public', titleKey: 'pages.notFound' },
]

export const flatRoutes = (from: AppRoute[] = routes): AppRoute[] =>
  from.flatMap((route) => [route, ...flatRoutes(route.children ?? [])])

export const routeByName = (name: string): AppRoute | undefined =>
  flatRoutes().find((route) => route.name === name)

/**
 * Whether a path runs full-bleed, without the app's usual chrome.
 *
 * Read off the route table rather than listed anywhere, so the shell, the rest
 * banner and the native wrapper cannot disagree about which screens these are.
 */
export const isFocusedShellPath = (pathname: string): boolean =>
  flatRoutes()
    .filter((route) => route.focusedShell)
    .some(({ path }) => {
      if (!path.includes(':')) return pathname === path
      // '/workouts/routine/:routine_id' matches any single segment in its place.
      return new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname)
    })
