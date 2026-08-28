import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectFiles, readSource } from '../../tests/sourceScan'

// Three treatments sat at the same rank, all three inside a single scroll: an
// uppercase eyebrow above a bold title inside a card, a bold title alone inside
// a card, and an uppercase label floating outside one.
//
// The rule that settles it: uppercase outside a card is for list grouping only
// — TODAY, LAST WEEK, the buckets a list is cut into. Inside a card it is a
// bold title with an optional line under it. There is no eyebrow.
const ui = dirname(fileURLToPath(import.meta.url))

const offenders = (pattern: RegExp) =>
  collectFiles(ui, ['.tsx', '.css'])
    .flatMap((file) =>
      readSource(file)
        .split('\n')
        .map((line, index) => ({ index, line }))
        .filter(({ line }) => pattern.test(line))
        .map(({ index }) => `${relative(ui, file)}:${index + 1}`),
    )
    .sort()

describe('section headings', () => {
  // <h6> was a global uppercase eyebrow, which is how an exercise name ended up
  // set as a label on the workout editor.
  it('has no eyebrow-shaped heading element left', () => {
    expect(offenders(/<h6[\s>]/), 'use a card title, or a list group heading').toEqual([])
  })

  // The class is still the right thing for a list's group labels and for a
  // status kicker on a stat card; what it may not do is sit above a title.
  it('never puts an eyebrow directly above a heading', () => {
    const paired = collectFiles(ui, ['.tsx']).flatMap((file) => {
      // Comments are stripped before pairing: a paragraph of reasoning between
      // the eyebrow and the title it sits on does not make them further apart.
      const lines = readSource(file)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .split('\n')
        .filter((line) => line.trim().length > 0)

      return lines
        .map((line, index) => ({ index, line, next: lines.slice(index + 1, index + 4).join(' ') }))
        .filter(({ line }) => /className=\{styles\.eyebrow\}/.test(line))
        .filter(({ next }) => /<h[1-4]>/.test(next))
        .map(({ line }) => `${relative(ui, file)}: ${line.trim()}`)
    })

    expect(paired, paired.join('\n')).toEqual([])
  })
})
