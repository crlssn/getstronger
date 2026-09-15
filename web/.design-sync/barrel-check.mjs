// Fails when entry.ts lags the component catalogue.
//
// The barrel is hand-maintained and nothing else notices when it falls behind:
// a component missing from it is simply absent from the design system, and
// every count downstream agrees with itself. See NOTES.md.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..')

const barrel = new Set(
  [...readFileSync(join(here, 'entry.ts'), 'utf8').matchAll(/ui\/components\/(\w+)'/g)].map(
    (m) => m[1],
  ),
)

const onDisk = readdirSync(join(web, 'src/ui/components'))
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.spec.tsx'))
  .map((f) => f.replace(/\.tsx$/, ''))

// A file the barrel never names is invisible to the sync. The reverse — a
// barrel line with no file — is a broken import the build already rejects.
const missing = onDisk.filter((name) => !barrel.has(name)).sort()

if (missing.length > 0) {
  console.error(
    `✗ .design-sync/entry.ts is missing ${missing.length} component(s): ${missing.join(', ')}\n` +
      "  Add an `export * from '@/ui/components/<Name>'` line for each, then rebuild.",
  )
  process.exit(1)
}

console.log(`✓ entry.ts covers all ${onDisk.length} components`)
