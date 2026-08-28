import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const outputRoot = fileURLToPath(new URL('../../screenshots/', import.meta.url))

export const viewport = { height: 844, width: 390 }

// One line per page, appended by the worker process and read back by the global
// teardown, which runs elsewhere and cannot share memory with it.
export const recordsPath = join(outputRoot, 'pages.jsonl')

export const manifestPath = join(outputRoot, 'manifest.json')

export const contactSheetPath = join(outputRoot, 'index.html')

// The set as it was before this run, kept only long enough to compare against.
// It sits outside the published folder: a copy of a directory cannot be written
// inside the directory being copied.
export const baselineRoot = fileURLToPath(new URL('../../.screenshots-baseline/', import.meta.url))

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
  // What the comparison found: an image only the previous run had, one only
  // this run has, one whose page grew or shrank, or one whose pixels moved.
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
