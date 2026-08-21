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

  it('keeps interpolation placeholders aligned across locales', () => {
    const english = new Map(flattenEntries(en as Messages))
    const swedish = new Map(flattenEntries(sv as Messages))

    const mismatches: string[] = []
    for (const [key, enValue] of english) {
      const svValue = swedish.get(key)
      if (svValue === undefined) continue

      if (placeholders(enValue).join(',') !== placeholders(svValue).join(',')) {
        mismatches.push(`${key}: placeholders differ (${enValue} ⇄ ${svValue})`)
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([])
  })

  // i18next selects a plural form by suffix, so a key with only one arm
  // silently renders that arm for every count.
  it('gives every plural key both an _one and an _other arm', () => {
    for (const [locale, messages] of [
      ['en', en],
      ['sv', sv],
    ] as const) {
      const keys = new Set(flatten(messages as Messages))
      const lonely = [...keys]
        .filter((key) => key.endsWith('_one') || key.endsWith('_other'))
        .filter((key) => {
          const [stem] = key.split(/_(one|other)$/)
          return !keys.has(`${stem}_one`) || !keys.has(`${stem}_other`)
        })
        .map((key) => `${locale}:${key}`)

      expect(lonely, lonely.join('\n')).toEqual([])
    }
  })

  it('leaves no vue-i18n plural pipes behind', () => {
    const piped = [...flattenEntries(en as Messages), ...flattenEntries(sv as Messages)]
      .filter(([, value]) => value.includes(' | '))
      .map(([key, value]) => `${key}: ${value}`)

    expect(piped, piped.join('\n')).toEqual([])
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
