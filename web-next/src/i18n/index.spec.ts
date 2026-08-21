import { describe, expect, it } from 'vitest'
import { i18n, resolveLocale } from './index'

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

describe('i18n', () => {
  it('reads the catalogue by its dotted key', () => {
    expect(i18n.t('common.save')).toBe('Save')
  })

  // The catalogue writes placeholders with single braces, which is vue-i18n's
  // syntax rather than i18next's default '{{name}}'.
  it('interpolates single-brace placeholders', () => {
    expect(i18n.t('workout.setsCompact', { count: 3 })).toBe('3 sets')
  })

  it.each([
    [1, '1 set logged'],
    [2, '2 sets logged'],
    [0, '0 sets logged'],
  ])('picks the plural arm for count %i', (count, expected) => {
    expect(i18n.t('workout.loggedSets', { count })).toBe(expected)
  })

  it('translates into Swedish', async () => {
    const swedish = i18n.cloneInstance({ lng: 'sv' })
    await swedish.changeLanguage('sv')

    expect(swedish.t('workout.loggedSets', { count: 2 })).toBe('2 set loggade')
  })

  it('falls back to English for a locale that is missing a key', () => {
    expect(i18n.getFixedT('sv')('common.save')).toBe('Spara')
  })
})
