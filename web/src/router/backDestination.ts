import type { RouteLocationNormalizedLoaded } from 'vue-router'

type BackRoute = Pick<RouteLocationNormalizedLoaded, 'name' | 'params' | 'path'>

export interface BackDestination {
  /** i18n key, so the button names its destination in the active locale. */
  labelKey: string
  path: string
}

const stringParam = (value: unknown) => (typeof value === 'string' ? value : '')

/**
 * Returns the canonical parent for an in-app back button.
 *
 * Native browser back remains history-aware. The app button deliberately is not:
 * it always takes a user to the same parent page for the route they are viewing.
 */
export const backDestinationFor = (route: BackRoute): BackDestination => {
  const routeName = typeof route.name === 'string' ? route.name : ''
  const id = stringParam(route.params.id)
  const planId = stringParam(route.params.planId)

  if (/^\/users\/[^/]+\/(follows|followers|personal-bests)$/.test(route.path)) {
    return { labelKey: 'nav.back.profile', path: id ? `/users/${id}` : '/home' }
  }

  switch (routeName) {
    case 'list-notifications':
    case 'progress':
      return { labelKey: 'nav.back.profile', path: '/profile' }
    case 'user-view':
      return { labelKey: 'nav.back.home', path: '/home' }
    case 'edit-workout':
      return { labelKey: 'nav.back.workout', path: id ? `/workouts/${id}` : '/workout' }
    case 'view-workout':
    case 'quick-workout':
    case 'workout-routine':
      return { labelKey: 'nav.back.workouts', path: '/workout' }
    case 'edit-plan':
      return { labelKey: 'nav.back.plan', path: planId ? `/plans/${planId}` : '/plans' }
    case 'create-plan':
    case 'plan':
      return { labelKey: 'nav.back.training', path: '/plans' }
    case 'edit-routine':
      return { labelKey: 'nav.back.routine', path: id ? `/routines/${id}` : '/routines' }
    case 'create-routine':
    case 'routine':
      return { labelKey: 'nav.back.routines', path: '/routines' }
    case 'routines':
      return { labelKey: 'nav.back.training', path: '/plans' }
    case 'update-exercise':
      return { labelKey: 'nav.back.exercise', path: id ? `/exercises/${id}` : '/exercises' }
    case 'create-exercise':
    case 'view-exercise':
      return { labelKey: 'nav.back.exercises', path: '/exercises' }
    case 'signup':
    case 'verify-email':
    case 'forgot-password':
    case 'reset-password':
      return { labelKey: 'nav.back.login', path: '/login' }
    default:
      return { labelKey: 'nav.back.home', path: '/home' }
  }
}
