import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `main.css` is not this app's private stylesheet.
 *
 * design-sync compiles it, with everything it imports, into the single sheet
 * the getstronger-ds package ships beside the components — so every rule in it
 * is loaded by whoever mounts an <AppButton> in a page of their own. A rule
 * that lays out *this* page rides along: the status-bar inset padded the body
 * of every host document, and `#app` is a selector only this app's markup
 * answers to.
 *
 * So the shipped sheet styles the design system, and the shell layer styles
 * the window the design system happens to be in. `main.tsx` loads both, which
 * is the only reason the split costs the app nothing.
 */
const assets = import.meta.dirname
const src = join(assets, '..')

/** The sheets `main.css` pulls in, package imports aside — what actually ships. */
const shipped = (entry: string, seen = new Set<string>()): string[] => {
  if (seen.has(entry)) return []
  seen.add(entry)

  const css = readFileSync(entry, 'utf8')
  const imported = [...css.matchAll(/@import\s+'([^']+)'/g)]
    .map((match) => match[1] ?? '')
    .filter((path) => path.startsWith('.') || path.endsWith('.css'))
    .flatMap((path) => shipped(resolve(dirname(entry), path), seen))

  return [entry, ...imported]
}

/** Blanked rather than cut, so the line a rule is reported on still holds. */
const withoutComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (span) => span.replace(/[^\n]/g, ' '))

const sheets = shipped(join(assets, 'main.css')).map((path) => ({
  at: relative(src, path),
  css: withoutComments(readFileSync(path, 'utf8')),
}))

const offenders = (pattern: RegExp) =>
  sheets
    .flatMap(({ at, css }) =>
      css.split('\n').map((line, index) => ({ line, at: `${at}:${index + 1}` })),
    )
    .filter(({ line }) => pattern.test(line))
    .map(({ at }) => at)

describe('the stylesheet the design system ships', () => {
  // `#app` is the body of this app's index.html and of nothing else, so the
  // rule is dead in any other document — and silently, since an id that
  // matches nothing is not an error.
  it('names no element of the host page', () => {
    expect(offenders(/^\s*#[\w-]+[\s,{]/), "move the rule into the shell's own layer").toEqual([])
  })

  // Where the status bar and the home indicator are given room is the shell's
  // decision: it knows whether it is a full-screen app. A component that pins
  // itself to an edge still spends the inset it sits on.
  it('spends no window inset the shell has not decided to give up', () => {
    expect(offenders(/env\(safe-area-inset/), "move the rule into the shell's own layer").toEqual(
      [],
    )
  })
})

describe('the shell layer', () => {
  // The other half: the rules above still have to reach this app. They are not
  // imported by main.css — that is the whole point — so the entry loads them.
  it('is loaded by the app entry', () => {
    const entry = readFileSync(join(src, 'main.tsx'), 'utf8')

    expect(entry).toContain("import './assets/shell.css'")
  })
})
