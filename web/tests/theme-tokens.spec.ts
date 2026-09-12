import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectFiles, readSource } from './sourceScan'

/**
 * A token nothing reads is a value that looks like a decision and is not.
 *
 * `@theme` emits every property on `:root` and gives each one a utility, so a
 * dead token is invisible twice over: it renders in devtools like any live
 * value, and `bg-<name>` compiles whether or not a screen ever writes it. That
 * is how `--color-danger-outline` sat in both palettes, re-valued for the dark
 * one, while the sheet action it was meant for drew its edge with
 * `border-danger/30`.
 *
 * A token counts as read when its own name appears — `var(--color-scrim)`,
 * `min-h-(--size-control)` — or when the utility stem does, which is the name
 * without its namespace: `--color-record-surface` is read by
 * `bg-record-surface`. The check errs towards reading: a stem is matched
 * wherever it is written, so a token is only reported when the name appears
 * nowhere at all.
 */
const web = join(__dirname, '..')
const theme = join(web, 'src', 'assets', 'theme.css')

/** Tailwind's namespaces, stripped to leave the stem a utility is built on. */
const namespaces =
  /^--(animate|breakpoint|color|container|drop-shadow|ease|font|font-weight|inset-shadow|leading|perspective|radius|shadow|size|spacing|text|tracking)-/

/** Blanked rather than cut, so the line a token is reported on still holds. */
const withoutComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (span) => span.replace(/[^\n]/g, ' '))

/**
 * Every custom property the theme declares, with the line it first appears on.
 *
 * Everything from `@theme` onwards, so the dark palette's overrides are read
 * as the same tokens rather than as a second set.
 */
const declared = (css: string): Map<string, number> => {
  const clean = withoutComments(css)
  const opens = clean.indexOf('@theme')
  const tokens = new Map<string, number>()

  for (const match of clean.slice(opens).matchAll(/(--[\w-]+)\s*:/g)) {
    const line = clean.slice(0, opens + (match.index ?? 0)).split('\n').length
    if (!tokens.has(match[1] ?? '')) tokens.set(match[1] ?? '', line)
  }

  return tokens
}

/**
 * A `--text-x--line-height` is not its own token.
 *
 * Tailwind reads the pair off the font-size it hangs from, so it is named by
 * whatever names `--text-x` and can never be written on its own.
 */
const base = (token: string) => token.replace(/(?!^)--[\w-]+$/, '')

const sources = [
  ...collectFiles(join(web, 'src'), ['.ts', '.tsx', '.css']),
  ...collectFiles(join(web, 'tests'), ['.ts', '.tsx']),
].filter((file) => file !== theme)

const written = sources.map(readSource).join('\n')

const named = (token: string): boolean => {
  if (written.includes(token)) return true

  const stem = token.replace(namespaces, '')
  return new RegExp(`${stem}(?![\\w-])`).test(written)
}

const tokens = declared(readSource(theme))

const dead = [...tokens]
  .filter(([token]) => !named(token) && !named(base(token)))
  .map(([token, line]) => `src/assets/theme.css:${line} ${token}`)

describe('theme tokens', () => {
  it('declares no token nothing reads', () => {
    expect(dead.sort(), 'delete the token, or use it').toEqual([])
  })

  it('reads a token named only through its utility', () => {
    expect(named('--color-record-surface')).toBe(true)
  })

  it('reports a token no source writes', () => {
    expect(named('--color-nobody-asked')).toBe(false)
  })
})
