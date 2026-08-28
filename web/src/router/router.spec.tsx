// @vitest-environment jsdom

import type { AppRoute } from '@/router/routes'
import type { ScreenLoader } from '@/router/screens'

import { PlusIcon } from '@heroicons/react/24/outline'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'

import { buildRouteObjects } from '@/router/router'
import { routes } from '@/router/routes'
import { screens } from '@/router/screens'
import { useActionButton } from '@/stores/actionButton'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'

const label =
  (name: string): ScreenLoader =>
  () =>
    Promise.resolve({ Component: () => <p>{name}</p> })

const frame: ScreenLoader = () =>
  Promise.resolve({
    Component: () => (
      <>
        <p>frame</p>
        <Outlet />
      </>
    ),
  })

const table: AppRoute[] = [
  { name: 'home', path: '/home', access: 'auth', titleKey: 'pages.home' },
  { name: 'login', path: '/login', access: 'guest', titleKey: 'pages.login' },
  { name: 'landing', path: '/', access: 'landing' },
  {
    name: 'user-view',
    path: '/users/:id',
    access: 'auth',
    children: [
      { name: 'user-workouts', path: '', access: 'auth' },
      { name: 'user-followers', path: 'followers', access: 'auth' },
    ],
  },
]

const lookup: Partial<Record<string, ScreenLoader>> = {
  home: label('home screen'),
  login: label('login screen'),
  'user-view': frame,
  'user-workouts': label('their workouts'),
  'user-followers': label('their followers'),
}

const renderAt = (path: string) => {
  const router = createMemoryRouter(buildRouteObjects(table, lookup), { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const signIn = () => useAuthStore.setState({ userId: 'user-me', accessToken: 'token' })

describe('buildRouteObjects', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: '', accessToken: '' })
    usePageTitleStore.getState().setPageTitle('')
    useActionButton.getState().reset()
  })

  test('renders a route the visitor may see', async () => {
    signIn()
    renderAt('/home')

    expect(await screen.findByText('home screen')).toBeInTheDocument()
  })

  test('sends a signed-out visitor to the login screen', async () => {
    renderAt('/home')

    expect(await screen.findByText('login screen')).toBeInTheDocument()
  })

  test('keeps a signed-in user away from the guest screens', async () => {
    signIn()
    renderAt('/login')

    expect(await screen.findByText('home screen')).toBeInTheDocument()
  })

  test('sends the landing path wherever the visitor belongs', async () => {
    renderAt('/')
    expect(await screen.findByText('login screen')).toBeInTheDocument()
  })

  // The header follows the locale, so routes carry catalogue keys rather than
  // display strings.
  test('titles the page from the route’s catalogue key', async () => {
    signIn()
    renderAt('/home')
    await screen.findByText('home screen')

    expect(usePageTitleStore.getState().pageTitle).toBe('Home')
  })

  test('blanks the title for a route that sets its own', async () => {
    signIn()
    usePageTitleStore.getState().setPageTitle('Left over')
    renderAt('/users/user-1')

    await screen.findByText('their workouts')
    expect(usePageTitleStore.getState().pageTitle).toBe('')
  })

  test('nests a screen’s children inside it', async () => {
    signIn()
    renderAt('/users/user-1/followers')

    expect(await screen.findByText('frame')).toBeInTheDocument()
    expect(screen.getByText('their followers')).toBeInTheDocument()
  })

  test('clears the action button on every navigation', async () => {
    signIn()
    const router = renderAt('/users/user-1')
    await screen.findByText('their workouts')

    useActionButton.getState().set({ action: () => undefined, icon: PlusIcon })
    await router.navigate('/users/user-1/followers')
    await screen.findByText('their followers')

    expect(useActionButton.getState().icon).toBeUndefined()
  })
})

describe('the real route table', () => {
  test('has a screen for every route that renders one', () => {
    const withoutScreen = routes
      .flatMap((route) => [route, ...(route.children ?? [])])
      .filter((route) => !screens[route.name])
      .map((route) => route.name)

    // The landing route is the only one with nothing to render: it redirects.
    expect(withoutScreen).toEqual(['landing'])
  })

  // The map is a list of import paths and export names, which is exactly the
  // kind of wiring that goes stale silently when a screen is renamed.
  test.each(Object.keys(screens))('%s resolves to a component', async (name) => {
    const loaded = await screens[name]?.()

    expect(typeof loaded?.Component).toBe('function')
  })

  test('builds without throwing', async () => {
    const built = buildRouteObjects()

    expect(built.length).toBe(routes.length)
    await waitFor(() => expect(built[0]?.loader).toBeDefined())
  })
})
