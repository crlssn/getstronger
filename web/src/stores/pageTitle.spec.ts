import { beforeEach, describe, expect, test } from 'vitest'

import { usePageTitleStore } from './pageTitle'

describe('usePageTitleStore', () => {
  beforeEach(() => {
    usePageTitleStore.setState({ pageTitle: 'GetStronger' })
  })

  test('falls back to the product name', () => {
    expect(usePageTitleStore.getState().pageTitle).toBe('GetStronger')
  })

  test('takes the title the route supplies', () => {
    usePageTitleStore.getState().setPageTitle('Exercises')

    expect(usePageTitleStore.getState().pageTitle).toBe('Exercises')
  })

  // What the back row is named after: the screen actually left behind, rather
  // than the tab the current one hangs off.
  describe('the screen left behind', () => {
    test('is the title the last navigation arrived on', () => {
      usePageTitleStore.getState().enterPage('Exercises')
      usePageTitleStore.getState().enterPage('Bench press')

      expect(usePageTitleStore.getState().previousPageTitle).toBe('Exercises')
    })

    // A screen sets its own title once it has fetched what it is about, which
    // is the same page still — not somewhere the reader has been.
    test('does not move when a screen renames itself', () => {
      usePageTitleStore.getState().enterPage('Exercises')
      usePageTitleStore.getState().enterPage('View exercise')
      usePageTitleStore.getState().setPageTitle('Bench press')

      expect(usePageTitleStore.getState().previousPageTitle).toBe('Exercises')
    })

    // A route with no key blanks the title for the screen to fill in, and a
    // blank is not a screen anybody was on.
    test('skips a title the route left blank', () => {
      usePageTitleStore.getState().enterPage('Home')
      usePageTitleStore.getState().setPageTitle('Alex Morgan')
      usePageTitleStore.getState().enterPage('')

      expect(usePageTitleStore.getState().previousPageTitle).toBe('Alex Morgan')
    })
  })
})
