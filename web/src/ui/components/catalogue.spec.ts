import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The catalogue is the design system's contract: a component nobody can find
// gets reimplemented. This spec is what makes "add it to the system first"
// enforceable rather than aspirational — a new file under components/ fails
// the suite until README.md describes it.
const componentsDir = dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(join(componentsDir, 'README.md'), 'utf8')

const files = readdirSync(componentsDir).filter(
  (file) => file.endsWith('.tsx') && !file.endsWith('.spec.tsx'),
)

const exported = files.map((file) => file.replace(/\.tsx$/, ''))

// A file may export a second component that only makes sense beside the first
// — <SheetAction> in a sheet, <AppListItemLink> in a list. Those are part of
// the system too, so the catalogue may name them.
const components = new Set(
  files.flatMap((file) =>
    [...readFileSync(join(componentsDir, file), 'utf8').matchAll(/^export const ([A-Z]\w+)/gm)].map(
      (match) => match[1],
    ),
  ),
)

describe('the component catalogue', () => {
  it('lists every component in the design system', () => {
    const undocumented = exported.filter((name) => !readme.includes(`\`<${name}>\``))
    expect(undocumented, 'add these to web/src/ui/components/README.md').toEqual([])
  })

  it('describes nothing that no longer exists', () => {
    const documented = [...readme.matchAll(/`<(App[A-Za-z]+|[A-Z][A-Za-z]+)>`/g)].map(
      (match) => match[1],
    )
    const stale = [...new Set(documented)].filter((name) => !components.has(name))
    expect(stale, 'these are catalogued but nothing exports them').toEqual([])
  })

  it('gives every component a spec', () => {
    const specs = readdirSync(componentsDir).filter((file) => file.endsWith('.spec.tsx'))
    const untested = exported.filter((name) => !specs.includes(`${name}.spec.tsx`))
    expect(untested, 'every system component renders in a spec').toEqual([])
  })
})
