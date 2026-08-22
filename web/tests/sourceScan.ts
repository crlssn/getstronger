import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every source file under `src` worth scanning.
 *
 * Generated clients are skipped, and so are specs: their strings are fixtures
 * and assertions, not copy that reaches anybody.
 */
export const collectFiles = (directory: string, extensions: string[]): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return entry === 'proto' ? [] : collectFiles(path, extensions)
    }
    if (/\.spec\.[jt]sx?$/.test(path)) return []
    return extensions.some((extension) => path.endsWith(extension)) ? [path] : []
  })

export const readSource = (path: string) => readFileSync(path, 'utf8')

export interface Finding {
  line: number
  text: string
}

const lineOf = (haystack: string, index: number) => haystack.slice(0, index).split('\n').length

/**
 * Blanks a span character by character rather than removing it.
 *
 * Removal would splice the surrounding text into token sequences that were
 * never written, and it would move every line number after the cut.
 */
const blank = (source: string, pattern: RegExp) =>
  source.replace(pattern, (span) => span.replace(/[^\n]/g, ' '))

/**
 * Blanks everything a copy scan must not read: comments, string and template
 * literals, and JSX expression containers.
 *
 * The containers are what make this work on JSX. Translated copy is written
 * `{t('key')}`, so blanking every `{…}` leaves only the text somebody typed
 * straight into the markup.
 */
export const scrubbed = (source: string) => {
  let out = blank(source, /\/\*[\s\S]*?\*\//g)
  out = blank(out, /\/\/[^\n]*/g)
  out = blank(out, /`(?:[^`\\]|\\.)*`/g)
  out = blank(out, /'(?:[^'\\\n]|\\.)*'/g)
  out = blank(out, /"(?:[^"\\\n]|\\.)*"/g)
  // Innermost-first, repeatedly, so nested containers such as
  // {items.map((i) => <li>{i.name}</li>)} are blanked whole.
  let previous: string
  do {
    previous = out
    out = blank(out, /\{[^{}]*\}/g)
  } while (out !== previous)
  return out
}

/**
 * Text typed straight into JSX rather than read from the catalogue.
 *
 * Runs over scrubbed source, so whatever sits between an opening tag and the
 * next `<` is a literal text node. The match has to start at a real opening
 * tag rather than any `>`, because a bare one also ends a TypeScript generic:
 * `Omit<ComponentProps<typeof Link>, 'x'>` would otherwise read as markup.
 *
 * A lone capital is a type parameter, not a tag — `interface Props<T>` would
 * otherwise swallow everything up to the next element. Single-letter tags are
 * still read when they are lower case, which is every one HTML has: p, b, a.
 *
 * Two letters or more, since punctuation and single symbols are not copy.
 */
export const findLiteralText = (source: string): Finding[] => {
  const clean = scrubbed(source)
  const findings: Finding[] = []

  const textNode = /<(?:[a-z][A-Za-z0-9.]*|[A-Z][A-Za-z0-9.]+)(?:\s[^<>]*)?>([^<>]+)</g
  let match
  while ((match = textNode.exec(clean))) {
    const text = (match[1] ?? '').replace(/&\w+;/g, ' ')
    if (!/[A-Za-z]{2,}/.test(text)) continue
    findings.push({ line: lineOf(clean, match.index), text: text.trim().slice(0, 60) })
  }

  return findings
}

/** Attribute values that are format hints rather than words. */
const allowedAttributeValues = new Set(['m:ss'])

/**
 * User-facing attributes given a literal string instead of a translated one.
 *
 * In JSX a translated value is `aria-label={t('…')}` and a hard-coded one is
 * `aria-label="Close"`, so the quotes are the whole tell. Comments and string
 * literals are not scrubbed here: an attribute *is* a string literal.
 */
export const findStaticAttributes = (source: string): Finding[] => {
  const withoutComments = blank(blank(source, /\/\*[\s\S]*?\*\//g), /\/\/[^\n]*/g)
  const findings: Finding[] = []

  const attribute = /(?<![:\w-])(aria-label|placeholder|alt|title|label)="([^"]*)"/g
  let match
  while ((match = attribute.exec(withoutComments))) {
    const [, name = '', value = ''] = match
    if (!/[A-Za-z]{2,}/.test(value)) continue
    if (allowedAttributeValues.has(value)) continue
    findings.push({ line: lineOf(withoutComments, match.index), text: `${name}="${value}"` })
  }

  return findings
}

// The guard that makes the design refactor the last one: theme.css's role
// tokens are the only colour vocabulary. A raw palette utility appearing
// anywhere in src is drift.
const bannedPalette =
  /\b(?:[a-z-]+:)*(?:text|bg|border|divide|ring|from|via|to|decoration|fill|stroke|shadow|outline|accent|caret|placeholder)-(?:slate|stone|blue|emerald|amber|gray|zinc|neutral|red|orange|yellow|lime|green|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|achievement|champagne|gold)-[0-9]+(?:\/[0-9]+)?\b/

export const findRawPalettes = (source: string): Finding[] =>
  source
    .split('\n')
    .map((line, index) => ({ line: index + 1, match: line.match(bannedPalette) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ line: entry.line, text: entry.match?.[0] ?? '' }))
