// @vitest-environment node
//
// The hook only moves directories about, and jsdom leaves import.meta.url on a
// scheme fileURLToPath refuses.
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clearSet, requireBaseline } from './global-setup'

// A set is a 32 MB, six-minute artefact, and the hook that clears one runs
// before every capture. What it must never reach is the set beside it.

const sets = async (...refs: string[]) => {
  const root = await mkdtemp(join(tmpdir(), 'screenshots-'))

  for (const ref of refs) {
    await mkdir(join(root, ref, 'active'), { recursive: true })
    await writeFile(join(root, ref, 'active', 'home.png'), ref)
  }

  return { list: () => readdir(root), root }
}

describe('clearSet', () => {
  it('removes the set for the ref being photographed', async () => {
    const { list, root } = await sets('main')

    await clearSet({ changes: join(root, 'main', 'changes'), output: join(root, 'main') }, false)

    expect(await list()).toEqual([])
  })

  it('leaves every other ref alone', async () => {
    const { list, root } = await sets('main', 'my-branch')

    await clearSet(
      { changes: join(root, 'my-branch', 'changes'), output: join(root, 'my-branch') },
      false,
    )

    expect(await list()).toEqual(['main'])
    expect(await readdir(join(root, 'main', 'active'))).toEqual(['home.png'])
  })

  it('keeps the set when a filtered run is only re-photographing part of it', async () => {
    const { root } = await sets('main')
    const changes = join(root, 'main', 'changes')
    await mkdir(changes, { recursive: true })
    await writeFile(join(changes, 'pages.tsv'), 'changed\tactive/home.png\n')

    await clearSet({ changes, output: join(root, 'main') }, true)

    expect(await readdir(join(root, 'main'))).toEqual(['active'])
  })
})

describe('requireBaseline', () => {
  it('accepts a set that is there', async () => {
    const { root } = await sets('main', 'my-branch')

    await expect(
      requireBaseline(join(root, 'main'), 'main', join(root, 'my-branch')),
    ).resolves.toBeUndefined()
  })

  // Six minutes of photographing that reports every page as added is worse than
  // a refusal in the second before it starts.
  it('refuses to compare against a set nobody photographed', async () => {
    const { root } = await sets('my-branch')

    await expect(
      requireBaseline(join(root, 'main'), 'main', join(root, 'my-branch')),
    ).rejects.toThrow(/main/)
  })

  // The run is about to clear the set it is photographing, so comparing a ref
  // against itself would compare it with nothing at all.
  it('refuses to compare a set against itself', async () => {
    const { root } = await sets('main')

    await expect(requireBaseline(join(root, 'main'), 'main', join(root, 'main'))).rejects.toThrow(
      /cannot also be/,
    )
  })
})
