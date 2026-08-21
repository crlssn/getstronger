import { describe, expect, test } from 'vitest'

import { formatNumber, isNumber } from './numbers'

describe('isNumber', () => {
  test.each([0, -1, 12.5])('%o is a number', (value) => {
    expect(isNumber(value)).toBe(true)
  })

  test.each([NaN, '12', '', undefined])('%o is not a number', (value) => {
    expect(isNumber(value)).toBe(false)
  })
})

describe('formatNumber', () => {
  test('rounds to whole numbers by default', () => {
    expect(formatNumber(12.6)).toBe('13')
  })

  test('keeps the fraction digits it is asked for', () => {
    expect(formatNumber(12.55, 1)).toBe('12.6')
  })

  // Thousands separators come from the locale, which follows the date locale
  // rather than the browser's first language.
  test('groups thousands', () => {
    expect(formatNumber(12500)).toMatch(/^12.500$/)
  })
})
