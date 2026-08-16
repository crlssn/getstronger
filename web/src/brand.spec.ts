import { describe, expect, it } from 'vitest'

import { brandName, brandSignupSubtitle, brandSlogan } from './brand'
import { en, sv } from '@/i18n/messages'

const catalogues = { en, sv }

const flatten = (value: unknown, path = ''): [string, string][] => {
  if (typeof value === 'string') return [[path, value]]
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, path ? `${path}.${key}` : key),
  )
}

describe('brand', () => {
  it('keeps the name and slogan out of the message catalogues', () => {
    // They are brand assets, so a translator must not be able to reach them.
    for (const [locale, messages] of Object.entries(catalogues)) {
      for (const [key, value] of flatten(messages)) {
        expect(value, `${locale}.${key} hardcodes the brand name`).not.toContain(brandName)
        expect(value, `${locale}.${key} hardcodes the slogan`).not.toContain(brandSlogan)
        expect(value, `${locale}.${key} hardcodes the signup subtitle`).not.toContain(
          brandSignupSubtitle,
        )
      }
    }
  })

  it('interpolates the brand into the strings that mention it', () => {
    for (const [locale, messages] of Object.entries(catalogues)) {
      expect(messages.auth.loginTitle, locale).toContain('{brand}')
      expect(messages.auth.newMember, locale).toContain('{brand}')
    }
  })
})
