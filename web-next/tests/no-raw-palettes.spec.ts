import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { collectFiles, findRawPalettes, readSource } from './sourceScan'

// theme.css's role tokens are the only colour vocabulary. A raw palette
// utility anywhere in src is drift, and this test names the exact lines.

describe('findRawPalettes', () => {
  it.each([
    'bg-blue-500',
    'text-gray-700',
    'border-red-200',
    'hover:bg-emerald-600',
    'sm:focus:ring-indigo-400',
    'bg-slate-900/50',
  ])('flags %s', (utility) => {
    expect(findRawPalettes(`<div className="${utility}" />`)).toHaveLength(1)
  })

  it.each([
    'bg-surface',
    'text-ink-strong',
    'border-border-subtle',
    'text-danger',
    'bg-record-champagne',
    'grid-cols-2',
    'gap-4',
  ])('leaves the role token %s alone', (utility) => {
    expect(findRawPalettes(`<div className="${utility}" />`)).toEqual([])
  })

  it('reports the line the drift is on', () => {
    const source = [
      '.card {',
      '  background: var(--color-surface);',
      '}',
      '.bad { @apply bg-blue-500; }',
    ].join('\n')

    expect(findRawPalettes(source)).toEqual([{ line: 4, text: 'bg-blue-500' }])
  })
})

describe('colour vocabulary', () => {
  const files = collectFiles(join(__dirname, '..', 'src'), ['.tsx', '.ts', '.css'])

  it('uses only the role tokens from theme.css — no raw palette utilities', () => {
    const offenders = files.flatMap((file) =>
      findRawPalettes(readSource(file)).map(({ line, text }) => `${file}:${line} — ${text}`),
    )

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
