import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectFiles } from '../../../tests/sourceScan'

/**
 * A custom property the token layer does not declare belongs to the shell.
 *
 * `--tab-bar-height` is the only one today: the shell knows whether a screen
 * has a tab bar, and publishes how tall it is so anything pinned above it
 * clears exactly what is there. A component reading it may not also guess it.
 * The form footer fell back to the app's own 4.5rem, which is this app's tab
 * bar written into a component that design-sync ships to pages with no tab bar
 * at all — they got a bar floating 72px above the fold.
 *
 * Nothing is the right guess: a component drawn where the shell has said
 * nothing draws as though the thing it clears is not there.
 */
const components = import.meta.dirname
const tokens = readFileSync(join(components, '..', '..', 'assets', 'theme.css'), 'utf8')

const shellTokens = collectFiles(components, ['.module.css']).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g)]
    .filter(([, name]) => !tokens.includes(`${name}:`))
    .map(([, name, fallback]) => ({
      at: relative(components, file),
      name: name ?? '',
      fallback: fallback?.trim(),
    })),
)

describe('a shell token read by the design system', () => {
  it('falls back to nothing rather than to this app', () => {
    const guessed = shellTokens
      .filter(({ fallback }) => fallback !== undefined && !/^0[a-z]*$/.test(fallback))
      .map(({ at, name, fallback }) => `${at}: var(${name}, ${fallback})`)

    expect(guessed, 'the shell publishes this, so draw as if it had not').toEqual([])
  })

  // The other half: falling back to nothing is only safe while something sets
  // it. The shell declares it twice — the height of the bar, and zero on a
  // screen that has given it up.
  it('is published by the shell', () => {
    const shell = readFileSync(join(components, '..', 'shell', 'AppDashboard.module.css'), 'utf8')

    for (const { name } of shellTokens) expect(shell).toContain(`${name}:`)
  })
})
