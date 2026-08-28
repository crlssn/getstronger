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
  /**
   * Hides the tab bar, keeping the nav bar above.
   *
   * Every route a person creates or edits something on. These carried the tab
   * bar and a sticky action bar at once — around 180px of an 844px screen given
   * over to permanent chrome, with the form scrolling behind both — and the tab
   * bar was the half nobody in the middle of a form was reaching for. The nav
   * bar stays, because its back row is how one of these is left.
   */
  hidesTabBar?: boolean
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
    hidesTabBar: true,
  },
  {
    name: 'workout-routine',
    path: '/workouts/routine/:routine_id',
    access: 'auth',
    focusedShell: true,
  },

  { name: 'plans', path: '/plans', access: 'auth', titleKey: 'pages.training' },
  {
    name: 'create-plan',
    path: '/plans/create',
    access: 'auth',
    titleKey: 'pages.newPlan',
    hidesTabBar: true,
  },
  { name: 'plan', path: '/plans/:id', access: 'auth', titleKey: 'pages.plan' },
  {
    name: 'edit-plan',
    path: '/plans/:planId/edit',
    access: 'auth',
    titleKey: 'pages.editPlan',
    hidesTabBar: true,
  },

  { name: 'routines', path: '/routines', access: 'auth', titleKey: 'pages.routines' },
  {
    name: 'create-routine',
    path: '/routines/create',
    access: 'auth',
    titleKey: 'pages.createRoutine',
    hidesTabBar: true,
  },
  { name: 'routine', path: '/routines/:id', access: 'auth', titleKey: 'pages.routine' },
  {
    name: 'edit-routine',
    path: '/routines/:id/edit',
    access: 'auth',
    titleKey: 'pages.updateRoutine',
    hidesTabBar: true,
  },

  { name: 'exercises', path: '/exercises', access: 'auth', titleKey: 'pages.exercises' },
  {
    name: 'create-exercise',
    path: '/exercises/create',
    access: 'auth',
    titleKey: 'pages.createExercise',
    hidesTabBar: true,
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
    hidesTabBar: true,
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

  // Public: the app stores need a policy URL that opens without an account,
  // and the profile links to the same page from inside one.
  { name: 'privacy', path: '/privacy', access: 'public', titleKey: 'pages.privacy' },

  // TODO: Create a landing page.
  { name: 'landing', path: '/', access: 'landing' },
  { name: 'not-found', path: '*', access: 'public', titleKey: 'pages.notFound' },
]

export const flatRoutes = (from: AppRoute[] = routes): AppRoute[] =>
  from.flatMap((route) => [route, ...flatRoutes(route.children ?? [])])

export const routeByName = (name: string): AppRoute | undefined =>
  flatRoutes().find((route) => route.name === name)

const matches = (pathname: string, path: string): boolean => {
  if (!path.includes(':')) return pathname === path
  // '/workouts/routine/:routine_id' matches any single segment in its place.
  return new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`).test(pathname)
}

/**
 * Whether a path runs full-bleed, without the app's usual chrome.
 *
 * Read off the route table rather than listed anywhere, so the shell, the rest
 * banner and the native wrapper cannot disagree about which screens these are.
 */
export const isFocusedShellPath = (pathname: string): boolean =>
  flatRoutes()
    .filter((route) => route.focusedShell)
    .some(({ path }) => matches(pathname, path))

/**
 * Whether a path is a task rather than a place, and so hides the tab bar.
 *
 * Read off the route table for the same reason the focused shell is: the
 * shell, the form footer and the native wrapper cannot disagree about which
 * screens these are.
 */
export const hidesTabBarPath = (pathname: string): boolean =>
  flatRoutes()
    .filter((route) => route.hidesTabBar)
    .some(({ path }) => matches(pathname, path))
