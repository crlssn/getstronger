import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { baselineRoot, changesRoot, outputRoot, type Change } from './paths'

// Anti-aliasing aside, two runs of the same page render identically, so any
// remaining difference is a change somebody made rather than noise.
const perPixelTolerance = 0.15

const readPng = async (file: string) => {
  const contents = await readFile(file).catch(() => undefined)
  return contents ? PNG.sync.read(contents) : undefined
}

const pngsUnder = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
}

const compare = async (image: string): Promise<Change | undefined> => {
  const [before, after] = await Promise.all([
    readPng(join(baselineRoot, image)),
    readPng(join(outputRoot, image)),
  ])

  if (!after) return { image, kind: 'removed' }
  if (!before) return { image, kind: 'added' }

  if (before.height !== after.height || before.width !== after.width) {
    return {
      detail: `${before.width}×${before.height} → ${after.width}×${after.height}`,
      image,
      kind: 'resized',
    }
  }

  const diff = new PNG({ height: after.height, width: after.width })
  const pixels = pixelmatch(before.data, after.data, diff.data, after.width, after.height, {
    threshold: perPixelTolerance,
  })
  if (pixels === 0) return undefined

  const file = join(changesRoot, image)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, PNG.sync.write(diff))

  const share = (pixels / (after.width * after.height)) * 100
  return {
    detail: `${pixels} pixels, ${share.toFixed(2)}% of the image`,
    diff: relative(outputRoot, file),
    image,
    kind: 'changed',
  }
}

// Compares this run against the copy taken before it started. Images the run
// did not re-photograph compare equal to themselves, so a filtered run reports
// only what it touched.
export const changesSince = async (images: string[]): Promise<Change[]> => {
  const captured = new Set(images)
  const removed = (await pngsUnder(baselineRoot)).filter((image) => !captured.has(image))
  const changes = await Promise.all([...images, ...removed].map(compare))

  return changes.filter((change) => change !== undefined)
}
