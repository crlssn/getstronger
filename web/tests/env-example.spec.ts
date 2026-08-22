import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(__dirname, '..', '.env.example'), 'utf8')

/**
 * The assignments a dotenv file makes.
 *
 * Commented-out lines are skipped, so a variable this file documents without
 * setting is absent from the result rather than empty.
 */
const parseEnv = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )

// 'mise run worktree:env' seeds a new worktree's web/.env by copying this
// file, and posthog.ts initialises the SDK as soon as both variables hold a
// value. A placeholder here therefore points every fresh checkout at a host
// that does not resolve, and the end-to-end suite — which fails a page that
// emits console errors or failed requests — goes red on ERR_NAME_NOT_RESOLVED.

describe('web/.env.example', () => {
  const example = parseEnv(source)

  it('assigns the API URL, so an empty result below would mean a broken parse', () => {
    expect(example.VITE_API_URL).toMatch(/^https?:\/\//)
  })

  it.each(['VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST'])(
    'copies to a web/.env that leaves %s unset',
    (name) => {
      expect(example[name] ?? '').toBe('')
    },
  )

  it.each(['VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST'])('still documents %s', (name) => {
    expect(source).toContain(name)
  })
})
