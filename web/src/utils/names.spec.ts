import { describe, expect, it } from 'vitest'

import { initials } from '@/utils/names'

describe('initials', () => {
  it('takes the first letter of the first and last word', () => {
    expect(initials('Alex Morgan')).toBe('AM')
  })

  it('uses a single letter for a single-word name', () => {
    expect(initials('Alex')).toBe('A')
  })

  it('skips middle names', () => {
    expect(initials('Jane van der Doe')).toBe('JD')
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(initials('  Alex   Morgan  ')).toBe('AM')
  })

  it('upper-cases lowercase input', () => {
    expect(initials('alex morgan')).toBe('AM')
  })

  it('returns an empty string for a missing name', () => {
    expect(initials(undefined)).toBe('')
    expect(initials('')).toBe('')
  })
})
