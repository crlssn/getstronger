import { rm } from 'node:fs/promises'
import { outputRoot } from './paths'

// A run always publishes a complete set, so images from a page that no longer
// exists must not survive into the next one.
export default async () => {
  await rm(outputRoot, { force: true, recursive: true })
}
