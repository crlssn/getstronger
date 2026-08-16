import { rm } from 'node:fs/promises'
import { outputRoot } from './paths'

// A full run always publishes a complete set, so images from a page that no
// longer exists must not survive into the next one. A filtered re-capture sets
// SCREENSHOT_KEEP to leave the rest of the set in place; the command-line
// filter itself never reaches this hook, so it cannot be inferred here.
export default async () => {
  if (process.env.SCREENSHOT_KEEP) return

  await rm(outputRoot, { force: true, recursive: true })
}
