import { describe, expect, it } from 'vitest'
import { en, sv } from './messages'

type Messages = { [key: string]: Messages | string }

const flatten = (messages: Messages, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof value === 'string' ? [path] : flatten(value, path)
  })

const flattenEntries = (messages: Messages, prefix = ''): Array<[string, string]> =>
  Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof value === 'string'
      ? [[path, value] as [string, string]]
      : flattenEntries(value, path)
  })

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort()

const pluralArms = (message: string) => message.split('|').length

describe('messages', () => {
  it('translates every key in every supported locale', () => {
    expect(flatten(sv as Messages).sort()).toEqual(flatten(en as Messages).sort())
  })

  it('leaves no translation empty', () => {
    for (const [locale, messages] of [
      ['en', en],
      ['sv', sv],
    ] as const) {
      const empty = flattenEntries(messages as Messages)
        .filter(([, value]) => value.trim() === '')
        .map(([key]) => `${locale}:${key}`)
      expect(empty, empty.join('\n')).toEqual([])
    }
  })

  it('keeps interpolation placeholders and plural forms aligned across locales', () => {
    const english = new Map(flattenEntries(en as Messages))
    const swedish = new Map(flattenEntries(sv as Messages))

    const mismatches: string[] = []
    for (const [key, enValue] of english) {
      const svValue = swedish.get(key)
      if (svValue === undefined) continue

      if (placeholders(enValue).join(',') !== placeholders(svValue).join(',')) {
        mismatches.push(`${key}: placeholders differ (${enValue} ⇄ ${svValue})`)
      }
      if (pluralArms(enValue) !== pluralArms(svValue)) {
        mismatches.push(`${key}: plural forms differ (${enValue} ⇄ ${svValue})`)
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([])
  })

  it.each(['en', 'sv'] as const)('localises the email verification notice in %s', (locale) => {
    const messages = { en, sv }[locale]
    const keys = flatten(messages.auth.verification as unknown as Messages)

    expect(keys).toContain('pendingLabel')
    expect(keys).toContain('resend')
    expect(keys).toContain('cooldownButton')
    expect(keys).toContain('resendFailed')
    expect(Object.values(messages.auth.verification).every((value) => value !== '')).toBe(true)
  })
})
