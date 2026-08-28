// @vitest-environment node
//
// The comparator reads and writes files and never touches a DOM, and jsdom
// leaves import.meta.url on a scheme fileURLToPath refuses.
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { changesSince } from './diff'

// A page is one image on one side, both, or two of different sizes, and each
// combination is a kind the published report has to account for.

const png = (width: number, height: number, value: number) => {
  const image = new PNG({ height, width })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = value
    image.data[offset + 1] = value
    image.data[offset + 2] = value
    image.data[offset + 3] = 255
  }

  return PNG.sync.write(image)
}

const set = async () => {
  const base = await mkdtemp(join(tmpdir(), 'screenshots-'))
  const roots = {
    baseline: join(base, 'baseline'),
    changes: join(base, 'output', 'changes'),
    index: join(base, 'output', 'changes', 'pages.tsv'),
    output: join(base, 'output'),
  }

  const write = async (root: string, image: string, contents: Buffer) => {
    const file = join(root, image)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, contents)
  }

  return {
    after: (image: string, contents: Buffer) => write(roots.output, image, contents),
    before: (image: string, contents: Buffer) => write(roots.baseline, image, contents),
    index: () => readFile(roots.index, 'utf8'),
    roots,
  }
}

describe('changesSince', () => {
  it('says nothing about a page that did not move', async () => {
    const { after, before, roots } = await set()
    await before('active/01-home.png', png(4, 4, 10))
    await after('active/01-home.png', png(4, 4, 10))

    expect(await changesSince(['active/01-home.png'], roots)).toEqual([])
  })

  it('draws the difference a changed page made', async () => {
    const { after, before, roots } = await set()
    await before('active/01-home.png', png(4, 4, 10))
    await after('active/01-home.png', png(4, 4, 250))

    const [change] = await changesSince(['active/01-home.png'], roots)

    expect(change.kind).toBe('changed')
    expect(change.diff).toBe(join('changes', 'active', '01-home.png'))
    await expect(readFile(join(roots.changes, 'active/01-home.png'))).resolves.toBeDefined()
  })

  it('draws the difference a page that grew made', async () => {
    const { after, before, roots } = await set()
    await before('active/01-home.png', png(4, 4, 10))
    await after('active/01-home.png', png(4, 8, 10))

    const [change] = await changesSince(['active/01-home.png'], roots)

    expect(change.kind).toBe('resized')
    expect(change.detail).toContain('4×4 → 4×8')
    expect(change.diff).toBe(join('changes', 'active', '01-home.png'))
  })

  it('reports a page with no baseline as added', async () => {
    const { after, roots } = await set()
    await after('active/01-home.png', png(4, 4, 10))

    expect(await changesSince(['active/01-home.png'], roots)).toEqual([
      { image: 'active/01-home.png', kind: 'added' },
    ])
  })

  it('reports a page this run did not photograph as removed', async () => {
    const { before, roots } = await set()
    await before('active/01-home.png', png(4, 4, 10))

    expect(await changesSince([], roots)).toEqual([
      { image: 'active/01-home.png', kind: 'removed' },
    ])
  })

  // The case the published report used to drop: one image becomes two, so
  // neither side has a counterpart to difference against.
  it('reports both halves of a page that gained a fold', async () => {
    const { after, before, roots } = await set()
    await before('active/38-circuit.png', png(4, 4, 10))
    await after('active/38-circuit-1.png', png(4, 4, 10))
    await after('active/38-circuit-2.png', png(4, 4, 10))

    const changes = await changesSince(
      ['active/38-circuit-1.png', 'active/38-circuit-2.png'],
      roots,
    )

    expect(changes).toEqual([
      { image: 'active/38-circuit-1.png', kind: 'added' },
      { image: 'active/38-circuit-2.png', kind: 'added' },
      { image: 'active/38-circuit.png', kind: 'removed' },
    ])
  })

  // 'pr:screenshots' publishes the pages this index names, rather than the
  // difference images beside it.
  it('names every page that moved in the index the report reads', async () => {
    const { after, before, index, roots } = await set()
    await before('active/01-home.png', png(4, 4, 10))
    await after('active/01-home.png', png(4, 4, 250))
    await after('active/02-plans.png', png(4, 4, 10))

    await changesSince(['active/01-home.png', 'active/02-plans.png'], roots)

    expect(await index()).toBe('changed\tactive/01-home.png\nadded\tactive/02-plans.png\n')
  })
})
