import { beforeEach, describe, expect, test } from 'vitest'

import { selectNavTabsActive, useNavTabs } from './navTabs'

const store = () => useNavTabs.getState()

const tabs = [
  { name: 'Workouts', href: '/users/1' },
  { name: 'Followers', href: '/users/1/followers' },
]

describe('useNavTabs', () => {
  beforeEach(() => {
    useNavTabs.setState({ tabs: [] })
  })

  test('starts with no tabs', () => {
    expect(store().tabs).toEqual([])
    expect(selectNavTabsActive(store())).toBe(false)
  })

  test('becomes active once a view supplies tabs', () => {
    store().set(tabs)

    expect(store().tabs).toEqual(tabs)
    expect(selectNavTabsActive(store())).toBe(true)
  })

  // Navigation resets the tabs, so a view that sets none does not inherit the
  // previous view's.
  test('resets back to inactive', () => {
    store().set(tabs)
    store().reset()

    expect(store().tabs).toEqual([])
    expect(selectNavTabsActive(store())).toBe(false)
  })
})
