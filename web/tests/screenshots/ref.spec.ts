// @vitest-environment node
//
// Reads the ref out of Git and never touches a DOM, and jsdom leaves
// import.meta.url on a scheme fileURLToPath refuses.
import { afterEach, describe, expect, it } from 'vitest'
import { currentRef, refDirectory } from './ref'

// A set is addressed by what it is of, so this rule is the only thing standing
// between two branches' six-minute artefacts and each other.

describe('refDirectory', () => {
  it('names a set after the branch it was photographed on', () => {
    expect(refDirectory('main')).toBe('main')
  })

  it('folds the slash a directory cannot carry', () => {
    expect(refDirectory('claude/github-issue-1377-80720e')).toBe('claude-github-issue-1377-80720e')
  })

  it('keeps the short SHA a detached capture is named after', () => {
    expect(refDirectory('4c4c604e')).toBe('4c4c604e')
  })

  it('keeps the dots and underscores a branch name may hold', () => {
    expect(refDirectory('release_1.2.x')).toBe('release_1.2.x')
  })

  it('collapses a run of folded characters into one separator', () => {
    expect(refDirectory('feature//spike')).toBe('feature-spike')
  })

  it('names a ref no directory could be named after', () => {
    for (const ref of ['..', '/', '', '...']) {
      expect(refDirectory(ref)).toBe('unnamed-ref')
    }
  })

  it('never resolves outside the directory holding the sets', () => {
    for (const ref of ['../../etc', '..', 'a/../../b']) {
      expect(refDirectory(ref).includes('/')).toBe(false)
      expect(refDirectory(ref).startsWith('.')).toBe(false)
    }
  })
})

describe('currentRef', () => {
  afterEach(() => {
    delete process.env.SCREENSHOT_REF
  })

  it('reads the branch this worktree is on', () => {
    expect(currentRef()).not.toBe('')
  })

  it('is overridable, so a run can be told which set it is photographing', () => {
    process.env.SCREENSHOT_REF = 'main'
    expect(currentRef()).toBe('main')
  })
})
