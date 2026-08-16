import { cp, rm } from 'node:fs/promises'
import { baselineRoot, changesRoot, outputRoot } from './paths'

// A full run always publishes a complete set, so images from a page that no
// longer exists must not survive into the next one. A filtered re-capture sets
// SCREENSHOT_KEEP to leave the rest of the set in place; the command-line
// filter itself never reaches this hook, so it cannot be inferred here.
//
// A diff run keeps the set too, and first copies it aside: the comparison at
// the end of the run needs the images as they were before it started.
export default async () => {
  await rm(baselineRoot, { force: true, recursive: true })
  await rm(changesRoot, { force: true, recursive: true })

  if (!process.env.SCREENSHOT_DIFF) {
    if (!process.env.SCREENSHOT_KEEP) await rm(outputRoot, { force: true, recursive: true })
    return
  }

  await cp(outputRoot, baselineRoot, {
    filter: (source) => !source.startsWith(changesRoot) && !source.endsWith('.json'),
    force: true,
    recursive: true,
  })
}
