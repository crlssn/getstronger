import { describe, expect, it } from 'vitest'

import { handle, initials, usernameFromName } from '@/utils/names'

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

describe('handle', () => {
  it('prefixes the username with an at sign', () => {
    expect(handle('alex')).toBe('@alex')
  })

  it('ignores surrounding whitespace', () => {
    expect(handle('  alex  ')).toBe('@alex')
  })

  it('returns an empty string for a missing username', () => {
    expect(handle(undefined)).toBe('')
    expect(handle('')).toBe('')
  })
})

describe('usernameFromName', () => {
  it('lowercases the name and drops the spaces', () => {
    expect(usernameFromName('Alex Morgan')).toBe('alexmorgan')
  })

  it('folds accents rather than dropping the letters they sit on', () => {
    expect(usernameFromName('José Ängström')).toBe('joseangstrom')
  })

  it('drops characters a username may not contain, keeping dots and underscores', () => {
    expect(usernameFromName("Jane O'Doe-Smith_1.2")).toBe('janeodoesmith_1.2')
  })

  it('truncates to the thirty characters a username allows', () => {
    expect(usernameFromName('a'.repeat(40))).toBe('a'.repeat(30))
  })

  it('returns an empty string until three usable characters exist', () => {
    expect(usernameFromName('Al')).toBe('')
    expect(usernameFromName('J. B')).toBe('j.b')
    expect(usernameFromName(undefined)).toBe('')
  })
})
