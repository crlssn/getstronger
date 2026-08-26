import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const suite = join(__dirname, 'e2e')
const specs = readdirSync(suite).filter((entry) => entry.endsWith('.spec.ts'))

// The suite seeds once per run and copies the tables aside; putting them back
// is what keeps a spec file that deletes seeded rows from deciding whether the
// next one passes. A file that forgets the hook does not fail on its own — it
// fails whichever file the run happens to schedule after it, which is the kind
// of failure nobody can read. See tests/e2e/seed.ts.

describe('every end-to-end spec file', () => {
  it('has spec files to check, so an empty list below would mean a broken scan', () => {
    expect(specs.length).toBeGreaterThan(5)
  })

  it.each(specs)('resets the seeded data before its own tests: %s', (spec) => {
    const source = readFileSync(join(suite, spec), 'utf8')
    expect(source).toMatch(/test\.beforeAll\(resetSeedData\)/)
  })
})
