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
// — <SheetAction> in a sheet, <AppSegmentedNav> beside the control it mirrors.
// Those are part of the system too, so the catalogue may name them.
const sourceOf = new Map(
  files.flatMap((file) => {
    const source = readFileSync(join(componentsDir, file), 'utf8')
    return [...source.matchAll(/^export const ([A-Z]\w+)/gm)].map(
      (match) => [match[1], source] as const,
    )
  }),
)

const components = new Set(sourceOf.keys())

// The design side reads `.design-sync/docs/`, one file per component, split out
// of the catalogue's `###` sections. A section with no doc is a component the
// design system was never told about; a doc with no section describes one the
// app no longer has.
const docs = readdirSync(join(componentsDir, '../../../.design-sync/docs'))
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.replace(/\.md$/, ''))

const catalogued = [...readme.matchAll(/^### (.+)$/gm)].flatMap(([, heading]) =>
  [...heading.matchAll(/`<(\w+)>`/g)].map((match) => match[1]),
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

  it('hands every catalogued component to the design side', () => {
    const unsynced = catalogued.filter((name) => !docs.includes(name))
    expect(unsynced, 'regenerate web/.design-sync/docs/ from the catalogue').toEqual([])
  })

  it('keeps no design-sync doc the catalogue has dropped', () => {
    const orphaned = docs.filter((name) => !catalogued.includes(name))
    expect(orphaned, 'these docs describe components the catalogue no longer names').toEqual([])
  })

  // design-sync collapses a doc comment and cuts it — a component's summary at
  // its first line, a prop's at about 120 characters — so a sentence that runs
  // past either arrives on the design side mid-word. `AppListRow.to` reached it
  // as "…which is the whole reason this is a prop rather than ". Reasoning
  // belongs in a second paragraph, where the cut costs nothing.
  it('opens every doc comment with a sentence that survives the sync', () => {
    const cut = files.flatMap((file) => {
      const source = readFileSync(join(componentsDir, file), 'utf8')
      return [...source.matchAll(/\/\*\*(.*?)\*\//gs)].flatMap(([, body]) => {
        const lines = body.split('\n').map((line) => line.replace(/^\s*\*? ?/, '').trimEnd())
        const opening = lines.slice(lines.findIndex((line) => line.trim() !== ''))
        const blank = opening.findIndex((line) => line.trim() === '')
        const paragraph = blank === -1 ? opening : opening.slice(0, blank)
        if (paragraph.length === 0) return []

        const [first] = paragraph
        const joined = paragraph.join(' ')
        const whole = /[.:?!]$/.test(first.trim()) && joined.length <= 120
        return whole ? [] : [`${file}: ${joined}`]
      })
    })

    expect(cut, 'end the first line on a sentence, and keep it under 120 characters').toEqual([])
  })

  // A prop value lives in the prose, so it outlives the prop: the catalogue
  // described `variant="card"` long after AppInput's variants became `default`
  // and `hero`, and this file is where an author is sent to find out. A value
  // the component's own source never spells is that drift. A value the prose
  // rejects — AppNumberField is "not `type="number"`" — is not a claim.
  it('quotes no prop value its component does not take', () => {
    const drifted = readme
      .split(/^### /m)
      .slice(1)
      .flatMap((section) => {
        const [heading] = section.split('\n')
        const documented = [...heading.matchAll(/`<([A-Z]\w+)>`/g)].map((match) => match[1])
        const sources = documented.map((name) => sourceOf.get(name) ?? '')

        return [...section.matchAll(/(not )?`(\w+)="([^"]+)"`/g)]
          .filter(
            ([, rejected, , value]) =>
              !rejected &&
              !sources.some(
                (source) => source.includes(`'${value}'`) || source.includes(`"${value}"`),
              ),
          )
          .map(([, , prop, value]) => `${documented.join(' and ')}: ${prop}="${value}"`)
      })

    expect(drifted, 'these components take no such value').toEqual([])
  })

  it('gives every component a spec', () => {
    const specs = readdirSync(componentsDir).filter((file) => file.endsWith('.spec.tsx'))
    const untested = exported.filter((name) => !specs.includes(`${name}.spec.tsx`))
    expect(untested, 'every system component renders in a spec').toEqual([])
  })
})
