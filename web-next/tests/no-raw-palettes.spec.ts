import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The guard that makes the design refactor the last one: theme.css's role
// tokens are the only colour vocabulary. A raw palette utility appearing
// anywhere in src is drift, and this test names the exact lines.
const bannedPattern =
  /\b(?:[a-z-]+:)*(?:text|bg|border|divide|ring|from|via|to|decoration|fill|stroke|shadow|outline|accent|caret|placeholder)-(?:slate|stone|blue|emerald|amber|gray|zinc|neutral|red|orange|yellow|lime|green|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|achievement|champagne|gold)-[0-9]+(?:\/[0-9]+)?\b/

const collectFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return entry === 'proto' ? [] : collectFiles(path)
    }
    if (path.endsWith('.spec.tsx')) return []
    return path.endsWith('.tsx') || path.endsWith('.css') ? [path] : []
  })

describe('colour vocabulary', () => {
  it('uses only the role tokens from theme.css — no raw palette utilities', () => {
    const offenders: string[] = []

    for (const file of collectFiles(join(__dirname, '..', 'src'))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const match = line.match(bannedPattern)
          if (match) offenders.push(`${file}:${index + 1} — ${match[0]}`)
        })
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
