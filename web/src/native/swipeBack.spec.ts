import { describe, expect, test } from 'vitest'

import { canSwipeBack } from './swipeBack'

describe('canSwipeBack', () => {
  test('answers a screen pushed onto a tab', () => {
    expect(canSwipeBack('/workouts/abc', 1)).toBe(true)
    expect(canSwipeBack('/settings/units', 4)).toBe(true)
    expect(canSwipeBack('/users/123/follows', 2)).toBe(true)
  })

  // A tab root has no back chevron, and swiping one would peel sideways into
  // whichever tab happened to be open before it.
  test('stays out of the way on a tab root', () => {
    expect(canSwipeBack('/home', 3)).toBe(false)
    expect(canSwipeBack('/profile', 3)).toBe(false)
  })

  // The focused shell hides the tab bar so a workout cannot be left by
  // accident; an edge swipe would put the accident straight back.
  test('stays out of the way in a workout', () => {
    expect(canSwipeBack('/workouts/quick', 2)).toBe(false)
    expect(canSwipeBack('/workouts/routine/routine-1', 2)).toBe(false)
  })

  // The first entry of the session has only the blank document behind it, so
  // the gesture would peel the app itself away.
  test('stays out of the way on the first screen of the session', () => {
    expect(canSwipeBack('/workouts/abc', 0)).toBe(false)
  })
})
