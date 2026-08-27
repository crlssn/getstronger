import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// The guard behind issue #1219. 'mise run pr:screenshots' publishes a UI
// change's before/after evidence into the pull request body, but the
// pull-request skill still said images could only go to the chat reply — and
// that is the file an agent loads at the moment it writes the body, so the
// stale rule won and #1216 and #1218 were opened with words alone. These tests
// keep the files that answer the question from contradicting each other again.

const root = join(__dirname, '..', '..')

// 'worktrees' holds every other checkout in the main clone, and each carries
// its own copy of these files at whatever revision it is on.
const skipped = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'worktrees',
])

const markdownFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    if (skipped.has(entry)) return []
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return markdownFiles(path)
    return path.endsWith('.md') ? [path] : []
  })

const violations = (pattern: RegExp) =>
  markdownFiles(root)
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path))

// Every file that tells an agent where a UI change's evidence goes.
const guidance = [
  'web/CLAUDE.md',
  '.claude/skills/pull-request/SKILL.md',
  '.claude/skills/design-review/SKILL.md',
]

const publishCommand = 'mise run pr:screenshots <number> --append'

// The claims that sent #1216's images to the chat reply. Each says a UI
// change's evidence stops there, which is what the publishing task undid.
const contradictions = [
  /not in the (?:PR|pull request) body/i,
  /images could not be attached/i,
  /screenshots?[^.]{0,80}\bcannot\b[^.]{0,60}(?:PR|pull request) body/i,
]

describe('screenshot guidance', () => {
  it('reads the guidance files, so an empty scan below would mean a broken walk', () => {
    expect(markdownFiles(root).map((path) => relative(root, path))).toEqual(
      expect.arrayContaining(guidance),
    )
  })

  it.each(contradictions)('no markdown file claims %s', (pattern) => {
    expect(violations(pattern)).toEqual([])
  })

  it.each(guidance)('%s sends the evidence to the pull request body', (file) => {
    expect(readFileSync(join(root, file), 'utf8')).toContain(publishCommand)
  })
})
