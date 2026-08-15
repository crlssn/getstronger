import { describe, expect, it } from 'vitest'
import { en, sv } from './messages'

type Messages = { [key: string]: Messages | string }

const flatten = (messages: Messages, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof value === 'string' ? [path] : flatten(value, path)
  })

describe('messages', () => {
  it('translates every key in every supported locale', () => {
    expect(flatten(sv as Messages).sort()).toEqual(flatten(en as Messages).sort())
  })

  it.each(['en', 'sv'] as const)('localises the email verification notice in %s', (locale) => {
    const messages = { en, sv }[locale]
    const keys = flatten(messages.auth.verification as unknown as Messages)

    expect(keys).toContain('pendingLabel')
    expect(keys).toContain('resend')
    expect(keys).toContain('cooldown')
    expect(keys).toContain('resendFailed')
    expect(Object.values(messages.auth.verification).every((value) => value !== '')).toBe(true)
  })
})
