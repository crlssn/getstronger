import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectFiles } from '../../../tests/sourceScan'

// The lint rule stops a screen writing `<button>`. It cannot stop a screen
// styling a <Link> until it looks like one, which is how the app ended up with
// twelve link-shaped buttons the eye could not tell from AppButton.
//
// A button shape is four things at once: a height from the control scale, a
// radius, horizontal padding and a weight. Any one of them alone is fine —
// raising a link to the tap floor is exactly what `min-h` is for — so this
// only fires when a rule has assembled all four, which is a button.
const ui = join(dirname(fileURLToPath(import.meta.url)), '..')
const system = join(ui, 'components')

const height = /min-h-\(--size-control(-sm|-lg)?\)/
const radius = /rounded-(control|pill|card|lg|full)/
const padding = /\bp[xs]?-/
const weight = /font-(semibold|bold)/

const buttonShaped = (declaration: string) =>
  height.test(declaration) &&
  radius.test(declaration) &&
  padding.test(declaration) &&
  weight.test(declaration)

describe('control geometry', () => {
  it('is only built inside the design system', () => {
    const offenders = collectFiles(ui, ['.module.css'])
      .filter((file) => !file.startsWith(system))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ index, line }))
          .filter(({ line }) => buttonShaped(line))
          .map(({ index }) => `${relative(ui, file)}:${index + 1}`),
      )

    expect(
      offenders,
      'these rules build a button by hand — use AppButton, or add what is missing to the design system',
    ).toEqual([])
  })
})
