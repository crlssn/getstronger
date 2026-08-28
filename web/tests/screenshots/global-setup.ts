import { cp, rm, writeFile } from 'node:fs/promises'
import { captureSnapshot, restoreSnapshot } from '../snapshot'
import { baselineRoot, changesRoot, clockPath, outputRoot } from './paths'

// The flows photograph themselves creating an exercise, a routine, a plan and a
// workout, so a run leaves the database further along than it found it. A
// comparison whose baseline was taken before that would report every list the
// ordering touched — twenty pages, for a change to one — so the second run puts
// the data back first and renders against the same clock.
//
// 'screenshots' reseeds and takes the snapshot; 'screenshots:diff' restores it.
// See server/testing/factory/snapshot/main.go.
const alignData = async () => {
  if (process.env.SCREENSHOT_SNAPSHOT === 'capture') {
    captureSnapshot()
    // Put it straight back, so the run that takes the baseline photographs the
    // database every later comparison will. A list the seed writes one
    // timestamp across — the routines are ordered by created_at alone — comes
    // back in whatever order the rows were physically written in, and writing
    // them again is exactly what a restore does. Restoring here costs
    // milliseconds and makes every run start from the same one.
    restoreSnapshot()
    await writeFile(clockPath, `${new Date().toISOString()}\n`)
    return
  }

  if (process.env.SCREENSHOT_SNAPSHOT !== 'restore') return

  try {
    restoreSnapshot()
  } catch (error) {
    throw new Error(
      `${(error as Error).message}\n\nRun 'mise run screenshots' once: it reseeds, photographs the set,` +
        ` and takes the snapshot this comparison puts back before re-photographing.`,
      { cause: error },
    )
  }
}

// A full run always publishes a complete set, so images from a page that no
// longer exists must not survive into the next one. A filtered re-capture sets
// SCREENSHOT_KEEP to leave the rest of the set in place; the command-line
// filter itself never reaches this hook, so it cannot be inferred here.
//
// A diff run keeps the set too, and first copies it aside: the comparison at
// the end of the run needs the images as they were before it started.
export default async () => {
  await alignData()

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
