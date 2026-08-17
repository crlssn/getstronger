import { describe, expect, it } from 'vitest'

import { deepLinkPath, isWorkoutRoute } from './platform'

describe('deepLinkPath', () => {
  it('maps universal links onto the SPA path', () => {
    expect(deepLinkPath('https://www.getstronger.studio/verify-email?token=abc')).toBe(
      '/verify-email?token=abc',
    )
  })

  it('keeps query and hash of a password-reset link', () => {
    expect(deepLinkPath('https://www.getstronger.studio/reset-password?token=t#top')).toBe(
      '/reset-password?token=t#top',
    )
  })

  it('reads the first segment of a custom-scheme link as the path', () => {
    expect(deepLinkPath('getstronger://verify-email?token=abc')).toBe('/verify-email?token=abc')
    expect(deepLinkPath('getstronger://users/123')).toBe('/users/123')
  })

  it('returns undefined for garbage', () => {
    expect(deepLinkPath('not a url')).toBeUndefined()
  })
})

describe('isWorkoutRoute', () => {
  it.each([
    ['workout-routine', true],
    ['quick-workout', true],
    ['home', false],
    [undefined, false],
  ])('classifies %s as %s', (name, expected) => {
    expect(isWorkoutRoute(name)).toBe(expected)
  })
})
