import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The guard behind issue #953: user-visible copy lives in the i18n catalogue,
// never in templates. A literal text node or a static user-facing attribute in
// a component is English that Swedish users will see, and this test names the
// exact lines. Silent fallback made these easy to miss; now they fail CI.

// Attribute values that are format hints rather than words.
const allowedAttributeValues = new Set(['m:ss'])

const collectFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return entry === 'proto' ? [] : collectFiles(path)
    }
    return path.endsWith('.vue') ? [path] : []
  })

const templateOf = (source: string) => {
  const match = source.match(/<template>([\s\S]*)<\/template>/)
  return match ? match[1] : ''
}

// Comments are blanked character by character rather than removed: removal
// could splice the surrounding text into new token sequences, and blanking
// keeps every reported line number accurate.
const blankComments = (template: string) =>
  template.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '))

const lineOf = (haystack: string, index: number) => haystack.slice(0, index).split('\n').length

describe('template copy', () => {
  const files = collectFiles(join(__dirname, '..', 'src'))

  it('renders no literal text nodes — every visible string comes from the catalogue', () => {
    const offenders: string[] = []

    for (const file of files) {
      // Comments carry prose, interpolations carry expressions, and quoted
      // attribute values may carry `>` that would fake a tag boundary. All are
      // blanked in place.
      const scrubbed = blankComments(templateOf(readFileSync(file, 'utf8')))
        .replace(/"[^"]*"/g, (quoted) => quoted.replace(/[^\n]/g, ' '))
        .replace(/\{\{[\s\S]*?\}\}/g, (expression) => expression.replace(/[^\n]/g, ' '))

      const textNode = />([^<]+)</g
      let match
      while ((match = textNode.exec(scrubbed))) {
        const text = match[1].replace(/&\w+;/g, ' ')
        if (!/[A-Za-z]{2,}/.test(text)) continue
        offenders.push(`${file}:${lineOf(scrubbed, match.index)} — ${text.trim().slice(0, 60)}`)
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('binds every user-facing attribute — no static aria-labels, placeholders, or alt text', () => {
    const offenders: string[] = []

    for (const file of files) {
      const template = blankComments(templateOf(readFileSync(file, 'utf8')))

      const attribute = /(?<![:\w-])(aria-label|placeholder|alt|title|label)="([^"]*)"/g
      let match
      while ((match = attribute.exec(template))) {
        const value = match[2]
        if (!/[A-Za-z]{2,}/.test(value)) continue
        if (allowedAttributeValues.has(value)) continue
        offenders.push(`${file}:${lineOf(template, match.index)} — ${match[1]}="${value}"`)
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
