import { rm, stat, writeFile } from 'node:fs/promises'
import { captureSnapshot, restoreSnapshot } from '../snapshot'
import { baselineRef, baselineRoot, changesRoot, clockPath, outputRoot } from './paths'

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

// Photographing takes six minutes and reports every page as added when there is
// nothing to compare against, so a baseline that cannot be one is refused in
// the second before the run starts rather than discovered at the end of it.
export const requireBaseline = async (baseline: string, name: string, output: string) => {
  if (baseline === output) {
    throw new Error(
      `'${name}' is the set this run is photographing, so it cannot also be the one it` +
        ` compares against. Photograph the before on another ref, then name it with` +
        ` 'mise run screenshots:diff --against <ref>'.`,
    )
  }

  const there = await stat(baseline)
    .then((entry) => entry.isDirectory())
    .catch(() => false)
  if (there) return

  throw new Error(
    `No set photographed on '${name}', so there is nothing to compare against.` +
      ` Check that ref out and run 'mise run screenshots', or name a set that exists` +
      ` with 'mise run screenshots:diff --against <ref>'.`,
  )
}

// A full run always publishes a complete set, so images from a page that no
// longer exists must not survive into the next one. Only this ref's set is the
// run's to remove: the sets beside it are other branches' six-minute artefacts,
// and one of them is very likely the baseline this run compares against.
//
// A filtered re-capture keeps the set, to leave the pages it does not touch in
// place; the command-line filter itself never reaches this hook, so it cannot
// be inferred here.
export const clearSet = async (roots: { changes: string; output: string }, keep: boolean) => {
  await rm(roots.changes, { force: true, recursive: true })
  if (!keep) await rm(roots.output, { force: true, recursive: true })
}

export default async () => {
  await alignData()

  if (process.env.SCREENSHOT_DIFF) await requireBaseline(baselineRoot, baselineRef, outputRoot)

  await clearSet({ changes: changesRoot, output: outputRoot }, Boolean(process.env.SCREENSHOT_KEEP))
}
