import { describe, expect, test } from 'vitest'

import { parseDuration } from './parseDuration'

describe('parseDuration', () => {
  test('reads minutes and seconds from a colon form', () => {
    expect(parseDuration('1:30')).toBe(90)
    expect(parseDuration('0:45')).toBe(45)
    expect(parseDuration('12:00')).toBe(720)
  })

  test('fills in a missing half of the colon form', () => {
    expect(parseDuration('2:')).toBe(120)
    expect(parseDuration(':30')).toBe(30)
  })

  // A stopwatch reads "1:30" for what you type as "130"; treating bare digits
  // as raw seconds would make that 2:10.
  test('fills bare digits in from the right, like a stopwatch', () => {
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('130')).toBe(90)
    expect(parseDuration('1230')).toBe(750)
    expect(parseDuration('5')).toBe(5)
  })

  test('is nothing at all for an empty field', () => {
    expect(parseDuration('')).toBeUndefined()
    expect(parseDuration('   ')).toBeUndefined()
  })

  // A half-typed value must not wipe the number that was already there.
  test('keeps the previous value for something unreadable', () => {
    expect(parseDuration('abc', 90)).toBe(90)
    expect(parseDuration('-1:30', 90)).toBe(90)
    expect(parseDuration('1:-30', 90)).toBe(90)
  })

  test('has nothing to keep when there was no previous value', () => {
    expect(parseDuration('abc')).toBeUndefined()
  })

  // Seconds past 59 belong in the minutes, and the field caps rather than
  // silently rolling them over.
  test('caps the seconds half at 59', () => {
    expect(parseDuration('1:90')).toBe(119)
  })

  test('ignores stray characters around the digits', () => {
    expect(parseDuration(' 1m30 ')).toBe(90)
  })
})
