// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useActionButton } from '@/stores/actionButton'
import { useAuthStore } from '@/stores/auth'
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
    useActionButton.setState({ action: vi.fn(), icon: () => null })
  })

  // The action button belongs to a view of a screen, so even moving between a
  // parent's children has to drop it.
  test('clears the action button', () => {
    onNavigate()

    expect(useActionButton.getState().icon).toBeUndefined()
  })
})

describe('applyPageTitle', () => {
  beforeEach(() => {
    usePageTitleStore.setState({ pageTitle: 'GetStronger' })
  })

  // Routes carry catalogue keys rather than display strings, so the header
  // follows the locale — including a language chosen while it is on screen.
  test('keeps the route key for the header to read', () => {
    applyPageTitle('pages.exercises')

    expect(usePageTitleStore.getState().pageTitleKey).toBe('pages.exercises')
  })

  test('blanks the title for a screen that sets its own', () => {
    applyPageTitle('pages.exercises')

    applyPageTitle(undefined)

    expect(usePageTitleStore.getState().pageTitleKey).toBe('')
    expect(usePageTitleStore.getState().pageTitle).toBe('')
  })
})
