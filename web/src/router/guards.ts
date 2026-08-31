import type { RouteAccess } from '@/router/routes'

import { useActionButton } from '@/stores/actionButton'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'

export const loginPath = '/login'
export const homePath = '/home'

/**
 * Where a route should send the visitor instead of rendering, or undefined to
 * let it render.
 *
 * A pure function of the access rule and whether there is a token, so the
 * decision can be read without a router: React Router calls it from a route
 * wrapper, and a test calls it directly.
 */
export const redirectFor = (access: RouteAccess, signedIn: boolean): string | undefined => {
  switch (access) {
    case 'auth':
      return signedIn ? undefined : loginPath
    case 'guest':
      return signedIn ? homePath : undefined
    case 'landing':
      return signedIn ? homePath : loginPath
    case 'public':
      return undefined
  }
}

/** Reads the same token the HTTP layer sends, so the two cannot disagree. */
export const isSignedIn = () => useAuthStore.getState().accessToken !== ''

export const redirectForRoute = (access: RouteAccess) => redirectFor(access, isSignedIn())

/**
 * The bookkeeping every navigation does.
 *
 * The action button belongs to a view of a screen, so it resets on every
 * navigation, including between a parent route's children.
 */
export const onNavigate = () => {
  useActionButton.getState().reset()
}

/**
 * Sets the header title for a route.
 *
 * Routes carry catalogue keys rather than display strings, so the header
 * follows the selected locale. A route with no key blanks the title and lets
 * the screen set its own.
 */
export const applyPageTitle = (titleKey?: string) => {
  // enterPage rather than setPageTitle: this runs once per navigation, which is
  // exactly when the screen being left becomes the one back is named after.
  usePageTitleStore.getState().enterPage(titleKey)
}
