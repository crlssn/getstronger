// The paths the tab bar can land on.
//
// A screen is a tab root when the tab bar links to it, and anything else is a
// screen pushed on top of one. That is the whole header rule: tab roots get the
// large in-page title and no nav bar, pushed screens get the nav bar with a way
// back and no in-page title. Deriving it from the tab bar's own destinations
// rather than from a second hand-maintained list of route names is what stops a
// new screen from being added wrong.
export const tabRootPaths = [
  '/home',
  '/workout',
  '/plans',
  '/routines',
  '/exercises',
  '/profile',
] as const

export const isTabRoot = (path: string) =>
  tabRootPaths.includes(path as (typeof tabRootPaths)[number])

// Where "back" goes when a screen was opened directly and has no history to
// return to: the tab root it belongs to, found by its first path segment.
export const tabRootFor = (path: string) => {
  // A tab root is its own root. The segments below name collections, and two
  // of them ('/workout', '/profile') do not match the collection that leads to
  // them, so without this they would answer '/home' rather than themselves.
  if (isTabRoot(path)) return path

  const [segment] = path.split('/').filter(Boolean)
  if (!segment) return '/home'
  const collections: Record<string, string> = {
    exercises: '/exercises',
    notifications: '/profile',
    plans: '/plans',
    progress: '/profile',
    routines: '/routines',
    settings: '/profile',
    users: '/home',
    workouts: '/workout',
  }
  return collections[segment] ?? '/home'
}
