/**
 * The way non-component code redirects the user.
 *
 * The HTTP layer has to send an unauthenticated user back to the login screen,
 * but it cannot import the route table to do it: the routes lazily import the
 * views, and the views call the HTTP layer, so the import would close a cycle.
 * The app registers the router's `navigate` here at mount instead, and the
 * HTTP layer depends on this module rather than on the routes.
 */
export type Navigate = (to: string, options?: { replace?: boolean }) => void | Promise<void>

let navigate: Navigate | undefined

/** Called once, with the router's navigate, as the app mounts. */
export const setNavigator = (fn: Navigate | undefined) => {
  navigate = fn
}

export const currentPath = () => (typeof window === 'undefined' ? '/' : window.location.pathname)

/**
 * Navigates within the app, falling back to a document load.
 *
 * A redirect can be triggered by a request that a route loader fired before the
 * router finished mounting, and losing it would strand the user on a screen
 * they are no longer entitled to.
 */
export const goTo = async (to: string, options: { replace?: boolean } = {}): Promise<void> => {
  if (navigate) {
    await navigate(to, options)
    return
  }

  if (typeof window === 'undefined') return
  if (options.replace) window.location.replace(to)
  else window.location.assign(to)
}
