import { describe, expect, test } from 'vitest'

import { en } from '@/i18n/messages'
import { isTabRoot, tabRootPaths } from './tabs'
import { flatRoutes, hidesTabBarPath, isFocusedShellPath, routeByName, routes } from './routes'

const all = flatRoutes()

const titleKeys = all.map((route) => route.titleKey).filter(Boolean) as string[]

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[part]
    return undefined
  }, en)

describe('routes', () => {
  test('names are unique', () => {
    const names = all.map((route) => route.name)

    expect(new Set(names).size).toBe(names.length)
  })

  test('paths are unique', () => {
    const paths = routes.map((route) => route.path)

    expect(new Set(paths).size).toBe(paths.length)
  })

  // A missing key renders as the key itself, which reaches the user as
  // 'pages.home' in the header.
  test('every title key exists in the catalogue', () => {
    const missing = titleKeys.filter((key) => typeof lookup(key) !== 'string')

    expect(missing, missing.join('\n')).toEqual([])
  })

  test('every tab root is a route', () => {
    const paths = new Set(routes.map((route) => route.path))
    const missing = tabRootPaths.filter((path) => !paths.has(path))

    expect(missing, missing.join('\n')).toEqual([])
  })

  // The header rule reads a tab root's title from the route, so one without a
  // key would show a blank heading rather than the page name.
  test('every tab root route carries a title key', () => {
    const untitled = routes
      .filter((route) => isTabRoot(route.path))
      .filter((route) => !route.titleKey)
      .map((route) => route.name)

    expect(untitled, untitled.join('\n')).toEqual([])
  })

  test('only the quick-workout screens hide the chrome', () => {
    const focused = all.filter((route) => route.focusedShell).map((route) => route.name)

    expect(focused).toEqual(['quick-workout', 'workout-routine'])
  })

  test('the catch-all is last, so nothing is shadowed by it', () => {
    expect(routes.at(-1)?.name).toBe('not-found')
    expect(routes.filter((route) => route.path === '*')).toHaveLength(1)
  })

  test('every route below /users/:id is a child of it', () => {
    const parent = routeByName('user-view')

    expect(parent?.children?.map((child) => child.path)).toEqual([
      '',
      'follows',
      'followers',
      'personal-bests',
    ])
  })

  test.each([
    ['login', 'guest'],
    ['signup', 'guest'],
    ['forgot-password', 'guest'],
    ['reset-password', 'guest'],
    ['verify-email', 'guest'],
    ['verify-email-pending', 'guest'],
    ['home', 'auth'],
    ['logout', 'auth'],
    ['quick-workout', 'auth'],
    ['landing', 'landing'],
    ['privacy', 'public'],
    ['not-found', 'public'],
  ])('%s is reachable by %s', (name, access) => {
    expect(routeByName(name)?.access).toBe(access)
  })

  // Everything that is not an auth screen or the two special cases holds user
  // data, so forgetting the rule would expose it.
  test('every other route requires signing in', () => {
    const open = routes
      .filter((route) => route.access !== 'auth')
      .map((route) => route.name)
      .sort()

    expect(open).toEqual(
      [
        'forgot-password',
        'landing',
        'login',
        'not-found',
        'privacy',
        'reset-password',
        'signup',
        'verify-email',
        'verify-email-pending',
      ].sort(),
    )
  })
})

// Every route a person creates or edits something on. The tab bar plus a
// sticky action bar stacked ~180px of permanent chrome onto an 844px screen,
// with the form scrolling behind both of them.
describe('a create or edit route is a focused task', () => {
  test('every one of them hides the tab bar', () => {
    const editing = all
      .filter((route) => /^(create|edit|update)-/.test(route.name))
      .filter((route) => !route.hidesTabBar)
      .map((route) => route.name)

    expect(editing, editing.join('\n')).toEqual([])
  })

  // The nav bar stays: it carries the title and the way back, which is how one
  // of these is left. Hiding the whole shell would leave the form untitled.
  test('keeps the nav bar above them', () => {
    const alsoFocused = all
      .filter((route) => route.hidesTabBar && route.focusedShell)
      .map((route) => route.name)

    expect(alsoFocused, alsoFocused.join('\n')).toEqual([])
  })
})

describe('hidesTabBarPath', () => {
  test.each([
    ['/routines/create', true],
    ['/routines/routine-1/edit', true],
    ['/exercises/create', true],
    ['/plans/plan-1/edit', true],
    ['/workouts/workout-1/edit', true],
    ['/routines/routine-1', false],
    ['/workouts/workout-1', false],
    ['/home', false],
  ])('classifies %s as %s', (pathname, expected) => {
    expect(hidesTabBarPath(pathname)).toBe(expected)
  })
})

describe('isFocusedShellPath', () => {
  test.each([
    ['/workouts/quick', true],
    ['/workouts/routine/routine-1', true],
    ['/workouts/routine/routine-1/extra', false],
    ['/workouts/workout-1', false],
    ['/home', false],
  ])('classifies %s as %s', (pathname, expected) => {
    expect(isFocusedShellPath(pathname)).toBe(expected)
  })
})

describe('routeByName', () => {
  test('finds a nested route', () => {
    expect(routeByName('user-followers')?.path).toBe('followers')
  })

  test('returns nothing for a name that is not routed', () => {
    expect(routeByName('nowhere')).toBeUndefined()
  })
})
