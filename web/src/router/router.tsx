import type { AppRoute } from '@/router/routes'
import type { ScreenLoader } from '@/router/screens'
import type { RouteObject } from 'react-router-dom'

import { createBrowserRouter, redirect } from 'react-router-dom'

import { App } from '@/App'
import { applyPageTitle, onNavigate, redirectForRoute } from '@/router/guards'
import { routes } from '@/router/routes'
import { screens } from '@/router/screens'

/**
 * Turns the route table into React Router routes.
 *
 * The guard and the per-navigation bookkeeping run in a loader rather than in
 * an effect on the element: effects run child-first, so a wrapper blanking the
 * title would undo the dynamic title the screen had just set. A loader runs
 * before the screen exists at all.
 */
export const buildRouteObjects = (
  from: AppRoute[] = routes,
  lookup: Partial<Record<string, ScreenLoader>> = screens,
): RouteObject[] => {
  // The screen a navigation landed on, as opposed to the view of it. Moving
  // between a screen's own tabs is not a change of screen, and the tab bar's
  // state has to survive it.
  let previousScreen: string | undefined

  const loaderFor = (route: AppRoute, screen: string) => () => {
    const to = redirectForRoute(route.access)
    if (to) throw redirect(to)

    onNavigate(screen, previousScreen)
    previousScreen = screen
    applyPageTitle(route.titleKey)
    return null
  }

  const build = (list: AppRoute[], parentScreen?: string): RouteObject[] =>
    list.map((route) => {
      const screen = parentScreen ?? route.name
      const lazy = lookup[route.name]

      // A parent with children is only a frame around them: its children carry
      // the guard and the bookkeeping, and running them twice would reset the
      // tab bar the frame exists to hold.
      if (route.children?.length) {
        return { path: route.path, lazy, children: build(route.children, screen) }
      }

      return {
        // The index child of a nested route has no path of its own.
        ...(route.path === '' ? { index: true as const } : { path: route.path }),
        lazy,
        // The landing route has no screen — its loader always redirects — and
        // this stops the router falling back to an outlet with nothing in it.
        ...(lazy ? {} : { element: null }),
        loader: loaderFor(route, screen),
      }
    })

  return build(from)
}

export const createRouter = () =>
  createBrowserRouter([{ element: <App />, children: buildRouteObjects() }])
