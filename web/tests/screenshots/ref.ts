import { execFileSync } from 'node:child_process'

// A ref no directory could be named after — '..', or a name made only of the
// characters folded below. Never the empty string and never a dot: both would
// resolve to the directory holding every set, which a run then removes.
const unnameable = 'unnamed-ref'

// The set is addressed by what it is of rather than by when it was taken, so
// the ref becomes a directory name. Git allows '/' in a branch name and a
// directory cannot carry it; everything else outside this alphabet is folded
// the same way rather than trusted to be safe in a path.
export const refDirectory = (ref: string) => {
  const slug = ref.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return slug === '' ? unnameable : slug
}

const git = (...args: string[]) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

// The branch, or the short SHA when HEAD is detached — which is what a baseline
// captured on origin/main actually is. SCREENSHOT_REF overrides both, so a run
// can be told which set it is photographing.
export const currentRef = () =>
  process.env.SCREENSHOT_REF ||
  git('symbolic-ref', '--quiet', '--short', 'HEAD') ||
  git('rev-parse', '--short', 'HEAD') ||
  unnameable
