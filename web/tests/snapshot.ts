import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const program = 'server/testing/factory/snapshot/main.go'

// Copies the seeded rows into a schema of their own and puts them back on
// demand. Both suites need the data their run started from: the end-to-end
// specs between spec files, the screenshot comparison between two runs, whose
// flows would otherwise leave the second looking at what the first did.
const snapshot = (mode: 'capture' | 'drop' | 'restore') => {
  try {
    execFileSync('go', ['run', program, `-mode=${mode}`], { cwd: repositoryRoot, stdio: 'pipe' })
  } catch (error) {
    // execFileSync reports no more than "Command failed"; what the command
    // itself said is on the stderr it captured, and that is the half worth
    // reading.
    const output = (error as { stderr?: Buffer }).stderr?.toString().trim()
    throw new Error(`${program} -mode=${mode} failed${output ? `\n${output}` : ''}`, {
      cause: error,
    })
  }
}

export const captureSnapshot = () => snapshot('capture')

export const dropSnapshot = () => snapshot('drop')

export const restoreSnapshot = () => snapshot('restore')
