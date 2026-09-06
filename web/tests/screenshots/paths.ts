import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { currentRef, refDirectory } from './ref'

// Every set lives under the ref it was photographed on, so two branches hold a
// set at once and a run can only ever remove its own. Addressing a set by when
// it was taken — "the previous run" — meant one directory held whichever branch
// photographed it last, and every run was a chance to destroy the other's work.
export const screenshotsRoot = fileURLToPath(new URL('../../screenshots/', import.meta.url))

export const setRoot = (ref: string) => join(screenshotsRoot, refDirectory(ref))

export const ref = currentRef()

export const outputRoot = setRoot(ref)

export const viewport = { height: 844, width: 390 }

// One line per page, appended by the worker process and read back by the global
// teardown, which runs elsewhere and cannot share memory with it.
export const recordsPath = join(outputRoot, 'pages.jsonl')

export const manifestPath = join(outputRoot, 'manifest.json')

export const contactSheetPath = join(outputRoot, 'index.html')

// The set a comparison reads its before column from: another ref's, named by
// 'screenshots:diff --against'. It is nobody's copy-aside, so no ordering
// between the two runs can lose it.
export const baselineRef = process.env.SCREENSHOT_AGAINST ?? 'main'

export const baselineRoot = setRoot(baselineRef)

// The moment the snapshot of the seeded data was taken. Every run renders
// relative times against it rather than against the wall clock, so a page does
// not differ from its baseline only because "1 minute ago" became "3 minutes
// ago" while the comparison was being set up.
export const clockPath = fileURLToPath(new URL('../../.screenshots-clock', import.meta.url))

export const changesRoot = join(outputRoot, 'changes')

// Every page the comparison found had moved, one 'kind<tab>image' line each.
// Some kinds have no difference image to draw, so the folder alone does not say
// what a run found; 'pr:screenshots' reads this instead.
export const changesIndexPath = join(changesRoot, 'pages.tsv')

export type Change = {
  // What the comparison found: an image only the set compared against had, one
  // only this run has, one whose page grew or shrank, or one whose pixels moved.
  kind: 'added' | 'changed' | 'removed' | 'resized'
  detail?: string
  diff?: string
  image: string
}

export type Findings = {
  accessibility: string[]
  clippedText: string[]
  horizontalOverflow: string[]
  smallTapTargets: string[]
  tinyText: string[]
}

// A page the persona cannot reach is recorded with a reason and no images, so
// a missing screenshot is never a silent one.
export type PageRecord = {
  changes?: Change[]
  component: string
  findings?: Findings
  images: string[]
  name: string
  persona: string
  reason?: string
  route?: string
  title?: string
}
