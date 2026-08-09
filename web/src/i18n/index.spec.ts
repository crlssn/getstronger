import { describe, expect, it } from 'vitest'
import { resolveLocale } from './index'

describe('resolveLocale', () => {
  it.each([
    [['sv-SE'], 'sv'],
    [['sv'], 'sv'],
    [['en-GB'], 'en'],
    [['de-DE'], 'en'],
    [[], 'en'],
  ] as const)('resolves %s to %s', (languages, expected) => {
    expect(resolveLocale(languages)).toBe(expected)
  })

  it('uses Swedish when it is an accepted browser language', () => {
    expect(resolveLocale(['fr-FR', 'sv-SE', 'en-GB'])).toBe('sv')
  })
})
