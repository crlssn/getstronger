import { beforeEach, describe, expect, test } from 'vitest'

import { usePageTitleStore } from './pageTitle'

describe('usePageTitleStore', () => {
  beforeEach(() => {
    usePageTitleStore.setState({
      pageTitle: 'GetStronger',
      pageTitleKey: '',
      previousPageTitle: '',
      previousPageTitleKey: '',
    })
  })

  test('falls back to the product name', () => {
    expect(usePageTitleStore.getState().pageTitle).toBe('GetStronger')
  })

  test('takes the title the route supplies', () => {
    usePageTitleStore.getState().setPageTitle('Exercises')

    expect(usePageTitleStore.getState().pageTitle).toBe('Exercises')
  })

  // The key travels rather than the string it resolves to, so a language
  // chosen while the screen is open renames the header with it.
  test('keeps the key a route arrived with', () => {
    usePageTitleStore.getState().enterPage('pages.exercises')

    expect(usePageTitleStore.getState().pageTitleKey).toBe('pages.exercises')
    expect(usePageTitleStore.getState().pageTitle).toBe('')
  })

  // What the back row is named after: the screen actually left behind, rather
  // than the tab the current one hangs off.
  describe('the screen left behind', () => {
    test('is the title the last navigation arrived on', () => {
      usePageTitleStore.getState().enterPage('pages.exercises')
      usePageTitleStore.getState().enterPage('pages.viewExercise')

      expect(usePageTitleStore.getState().previousPageTitleKey).toBe('pages.exercises')
    })

    // A screen sets its own title once it has fetched what it is about, which
    // is the same page still — not somewhere the reader has been.
    test('does not move when a screen renames itself', () => {
      usePageTitleStore.getState().enterPage('pages.exercises')
      usePageTitleStore.getState().enterPage('pages.viewExercise')
      usePageTitleStore.getState().setPageTitle('Bench press')

      expect(usePageTitleStore.getState().previousPageTitleKey).toBe('pages.exercises')
    })

    // A route with no key blanks the title for the screen to fill in, and a
    // blank is not a screen anybody was on.
    test('skips a title the route left blank', () => {
      usePageTitleStore.getState().enterPage('pages.home')
      usePageTitleStore.getState().setPageTitle('Alex Morgan')
      usePageTitleStore.getState().enterPage()

      expect(usePageTitleStore.getState().previousPageTitle).toBe('Alex Morgan')
      expect(usePageTitleStore.getState().previousPageTitleKey).toBe('')
    })
  })
})
