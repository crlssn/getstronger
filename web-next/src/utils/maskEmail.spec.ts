import { describe, expect, it } from 'vitest'
import { maskEmail } from './maskEmail'

describe('maskEmail', () => {
  it.each([
    ['alex@example.com', 'a••x@example.com'],
    ['ab@example.com', 'a•@example.com'],
    ['a@example.com', '•@example.com'],
    ['ALEX.MORGAN@Example.COM', 'A••••••••N@Example.COM'],
  ])('masks the local part of %s', (email, expected) => {
    expect(maskEmail(email)).toBe(expected)
  })

  it('keeps the domain so that a mistyped domain stays visible', () => {
    expect(maskEmail('alex@gmial.com')).toContain('@gmial.com')
  })

  it('caps the mask so that a long address cannot break the layout', () => {
    expect(maskEmail('averyveryverylongaddress@example.com')).toBe('a••••••••s@example.com')
  })

  it.each(['', 'not-an-email', '@example.com', 'alex@'])(
    'returns nothing for %s so that no unusable hint is shown',
    (email) => {
      expect(maskEmail(email)).toBe('')
    },
  )
})
