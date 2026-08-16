import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const outputRoot = fileURLToPath(new URL('../../screenshots/', import.meta.url))

// Skipped pages are appended by the worker process and read back by the global
// teardown, which runs elsewhere and cannot share memory with it.
export const skippedPath = join(outputRoot, 'skipped.jsonl')

export const contactSheetPath = join(outputRoot, 'index.html')
