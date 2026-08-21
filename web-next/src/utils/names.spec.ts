import { describe, expect, it, test } from 'vitest'

import { initials, titleCase } from '@/utils/names'

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

describe('titleCase', () => {
  test.each([
    ['bench press', 'Bench Press'],
    ['BENCH PRESS', 'Bench Press'],
    ['bEnCh pReSs', 'Bench Press'],
    // Compound exercise names are written with a slash, and both halves are
    // the start of a word.
    ['pull/chin up', 'Pull/Chin Up'],
    ['', ''],
  ])('turns %o into %o', (input, expected) => {
    expect(titleCase(input)).toBe(expected)
  })
})
