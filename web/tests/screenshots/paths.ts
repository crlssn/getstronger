import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const outputRoot = fileURLToPath(new URL('../../screenshots/', import.meta.url))

export const viewport = { height: 844, width: 390 }

// One line per page, appended by the worker process and read back by the global
// teardown, which runs elsewhere and cannot share memory with it.
export const recordsPath = join(outputRoot, 'pages.jsonl')

export const manifestPath = join(outputRoot, 'manifest.json')

export const contactSheetPath = join(outputRoot, 'index.html')

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
  component: string
  findings?: Findings
  images: string[]
  name: string
  persona: string
  reason?: string
  route?: string
  title?: string
}
