import { describe, expect, test } from 'vitest'

import { isTabRoot, tabRootFor, tabRootPaths } from './tabs'

describe('isTabRoot', () => {
  test.each(tabRootPaths)('%s is a tab root', (path) => {
    expect(isTabRoot(path)).toBe(true)
  })

  // The header rule hangs off this: a tab root gets the large in-page title,
  // anything pushed on top of one gets the nav bar and a way back.
  test.each(['/exercises/1', '/users/1/followers', '/workouts/1', '/login', '/'])(
    '%s is a pushed screen, not a tab root',
    (path) => {
      expect(isTabRoot(path)).toBe(false)
    },
  )
})

describe('tabRootFor', () => {
  test.each([
    ['/exercises/1', '/exercises'],
    ['/notifications', '/profile'],
    ['/plans/1', '/plans'],
    ['/progress', '/profile'],
    ['/routines/1/edit', '/routines'],
    ['/users/1/followers', '/home'],
    ['/workouts/1', '/workout'],
  ])('%s belongs to %s', (path, expected) => {
    expect(tabRootFor(path)).toBe(expected)
  })

  test.each(['/', '', '///'])('falls back to /home for %o', (path) => {
    expect(tabRootFor(path)).toBe('/home')
  })

  test('falls back to /home for a segment no tab owns', () => {
    expect(tabRootFor('/somewhere-new/1')).toBe('/home')
  })

  // '/workout' and '/profile' are not the segments that lead to them
  // ('workouts', 'notifications'), so a lookup by segment alone sends them to
  // '/home' instead of back to themselves.
  test.each(tabRootPaths)('%s is its own root', (path) => {
    expect(tabRootFor(path)).toBe(path)
  })
})
