// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useActionButton } from '@/stores/actionButton'
import { useAuthStore } from '@/stores/auth'
import { useNavTabs } from '@/stores/navTabs'
import { usePageTitleStore } from '@/stores/pageTitle'
import {
  applyPageTitle,
  homePath,
  isSignedIn,
  loginPath,
  onNavigate,
  redirectFor,
  redirectForRoute,
} from './guards'
import { routes } from './routes'

describe('redirectFor', () => {
  test.each([
    ['auth', true, undefined],
    ['auth', false, loginPath],
    ['guest', true, homePath],
    ['guest', false, undefined],
    ['landing', true, homePath],
    ['landing', false, loginPath],
    ['public', true, undefined],
    ['public', false, undefined],
  ] as const)('%s route, signed in %s', (access, signedIn, expected) => {
    expect(redirectFor(access, signedIn)).toBe(expected)
  })

  // A rule nothing handles would fall through as "render it", which is the
  // wrong default for a table of mostly-private screens.
  test('decides for every access rule the table uses', () => {
    const rules = new Set(routes.map((route) => route.access))

    for (const rule of rules) {
      expect(() => redirectFor(rule, true)).not.toThrow()
      expect(() => redirectFor(rule, false)).not.toThrow()
    }
  })
})

describe('isSignedIn', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: '', accessToken: '' })
  })

  test('follows the access token', () => {
    expect(isSignedIn()).toBe(false)

    useAuthStore.setState({ userId: 'user-1', accessToken: 'token' })

    expect(isSignedIn()).toBe(true)
  })

  test('redirectForRoute reads it', () => {
    expect(redirectForRoute('auth')).toBe(loginPath)

    useAuthStore.setState({ userId: 'user-1', accessToken: 'token' })

    expect(redirectForRoute('auth')).toBeUndefined()
  })
})

describe('onNavigate', () => {
  beforeEach(() => {
    useNavTabs.setState({ tabs: [{ name: 'Workouts', href: '/users/1' }] })
    useActionButton.setState({ action: vi.fn(), icon: () => null })
  })

  test('clears the tabs when the screen changes', () => {
    onNavigate('exercises', 'home')

    expect(useNavTabs.getState().tabs).toEqual([])
  })

  // The tabs belong to the screen, and /users/:id keeps them across its own
  // children.
  test('keeps the tabs while staying on the same screen', () => {
    onNavigate('user-view', 'user-view')

    expect(useNavTabs.getState().tabs).toHaveLength(1)
  })

  // The action button belongs to a view of a screen, so even moving between a
  // parent's children has to drop it.
  test('always clears the action button', () => {
    onNavigate('user-view', 'user-view')

    expect(useActionButton.getState().icon).toBeUndefined()
  })

  test('clears both on the first navigation', () => {
    onNavigate('home')

    expect(useNavTabs.getState().tabs).toEqual([])
    expect(useActionButton.getState().icon).toBeUndefined()
  })
})

describe('applyPageTitle', () => {
  beforeEach(() => {
    usePageTitleStore.setState({ pageTitle: 'GetStronger' })
  })

  // Routes carry catalogue keys rather than display strings, so the header
  // follows the locale.
  test('translates the route key', () => {
    applyPageTitle('pages.exercises')

    expect(usePageTitleStore.getState().pageTitle).toBe('Exercises')
  })

  test('blanks the title for a screen that sets its own', () => {
    applyPageTitle('pages.exercises')

    applyPageTitle(undefined)

    expect(usePageTitleStore.getState().pageTitle).toBe('')
  })
})
