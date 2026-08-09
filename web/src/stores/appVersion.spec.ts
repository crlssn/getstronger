import { describe, expect, it } from 'vitest'

import { isOutdated } from './appVersion'

describe('isOutdated', () => {
  it('reports a deploy when the served version differs', () => {
    expect(isOutdated('abc123', 'def456')).toBe(true)
  })

  it('stays quiet when the versions match', () => {
    expect(isOutdated('abc123', 'abc123')).toBe(false)
  })

  it.each([
    ['a missing version', undefined],
    ['a null version', null],
    ['a non-string version', 42],
    ['an empty string', ''],
  ])('does not prompt on %s', (_label, latest) => {
    expect(isOutdated('abc123', latest)).toBe(false)
  })

  it('does not prompt when the running version is unknown', () => {
    // A dev build has no injected version; never nag in that case.
    expect(isOutdated('', 'def456')).toBe(false)
  })
})
