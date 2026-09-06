import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { baselineRoot, changesIndexPath, changesRoot, outputRoot, type Change } from './paths'

// Anti-aliasing aside, two runs of the same page render identically, so any
// remaining difference is a change somebody made rather than noise.
const perPixelTolerance = 0.15

// Where the two sets, the highlighted differences, and the index naming them
// live. A parameter rather than a constant so the comparator can be exercised
// against a throwaway set instead of the one in web/screenshots.
export type Roots = {
  // Another ref's set, so its directory name is the ref the before column
  // comes from.
  baseline: string
  changes: string
  index: string
  output: string
}

const defaultRoots: Roots = {
  baseline: baselineRoot,
  changes: changesRoot,
  index: changesIndexPath,
  output: outputRoot,
}

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

// pixelmatch compares two buffers of one size, so a page that grew is laid on
// a canvas big enough for both. The padding is transparent, which pixelmatch
// reads as white, so the ground a page gained is part of its difference.
const onCanvas = (source: PNG, width: number, height: number) => {
  if (source.width === width && source.height === height) return source

  const canvas = new PNG({ height, width })
  for (let row = 0; row < source.height; row += 1) {
    const start = row * source.width * 4
    source.data.copy(canvas.data, row * width * 4, start, start + source.width * 4)
  }

  return canvas
}

const compare = async (image: string, roots: Roots): Promise<Change | undefined> => {
  const [before, after] = await Promise.all([
    readPng(join(roots.baseline, image)),
    readPng(join(roots.output, image)),
  ])

  if (!after) return { image, kind: 'removed' }
  if (!before) return { image, kind: 'added' }

  const width = Math.max(before.width, after.width)
  const height = Math.max(before.height, after.height)
  const resized = before.width !== after.width || before.height !== after.height

  const diff = new PNG({ height, width })
  const pixels = pixelmatch(
    onCanvas(before, width, height).data,
    onCanvas(after, width, height).data,
    diff.data,
    width,
    height,
    { threshold: perPixelTolerance },
  )
  if (pixels === 0 && !resized) return undefined

  const file = join(roots.changes, image)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, PNG.sync.write(diff))

  const share = (pixels / (width * height)) * 100
  return {
    detail: resized
      ? `${before.width}×${before.height} → ${after.width}×${after.height}, ${pixels} pixels`
      : `${pixels} pixels, ${share.toFixed(2)}% of the image`,
    diff: relative(roots.output, file),
    image,
    kind: resized ? 'resized' : 'changed',
  }
}

// 'pr:screenshots' publishes the pages this names rather than the difference
// images beside it. A page that gained or lost a fold has an image on one side
// only and no difference to draw, and reading the folder alone left it out of
// the very report meant to show it.
const writeIndex = async (changes: Change[], roots: Roots) => {
  await mkdir(roots.changes, { recursive: true })
  await writeFile(
    roots.index,
    changes.map((change) => `${change.kind}\t${change.image}\n`).join(''),
  )
  // Which set the before column came from. 'pr:screenshots' reads it to find
  // those images and to name the comparison in the block it publishes, so a
  // report against the wrong baseline is visible rather than silent.
  await writeFile(join(roots.changes, 'against'), `${basename(roots.baseline)}\n`)
}

// Compares this run against another ref's set. Images the run did not
// re-photograph compare equal to themselves, so a filtered run reports only
// what it touched.
export const changesSince = async (images: string[], roots = defaultRoots): Promise<Change[]> => {
  const captured = new Set(images)
  const removed = (await pngsUnder(roots.baseline)).filter((image) => !captured.has(image))
  const compared = await Promise.all([...images, ...removed].map((image) => compare(image, roots)))
  const changes = compared.filter((change) => change !== undefined)

  await writeIndex(changes, roots)

  return changes
}
