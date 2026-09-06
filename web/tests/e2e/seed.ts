import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { captureSnapshot, dropSnapshot, restoreSnapshot } from '../snapshot'

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

export const seedEmail =
  process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'active@getstronger.test'
export const seedPassword =
  process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? 'password123'
// The other persona who can log in: an account with no history of its own.
export const newUserEmail = process.env.NEW_USER_EMAIL ?? 'new@getstronger.test'

// A deployed target owns its own data, so a run against one neither seeds nor
// resets anything.
export const ownsSeedData = process.env.E2E_BASE_URL === undefined

const runCommand = (program: string, args: string[]) => {
  try {
    execFileSync('go', ['run', program, ...args], { cwd: repositoryRoot, stdio: 'pipe' })
  } catch (error) {
    // execFileSync reports no more than "Command failed"; what the command
    // itself said is on the stderr it captured, and that is the half worth
    // reading.
    const output = (error as { stderr?: Buffer }).stderr?.toString().trim()
    throw new Error(`${program} ${args.join(' ')} failed${output ? `\n${output}` : ''}`, {
      cause: error,
    })
  }
}

// Writing the seeded rows costs seconds — bcrypt for every persona, and a
// couple of thousand inserts — so the run does it once, in global setup, and
// copies the result aside. Every reset after that is a copy back, which costs
// milliseconds. See server/testing/factory/snapshot/main.go.
export const seedDatabase = () => {
  runCommand('./server/testing/factory/seed', [
    `-email=${seedEmail}`,
    `-password=${seedPassword}`,
    `-name=${process.env.USER_NAME ?? 'Alex Morgan'}`,
    `-new-email=${newUserEmail}`,
    `-new-name=${process.env.NEW_USER_NAME ?? 'Sam Taylor'}`,
  ])
  captureSnapshot()
}

// The copies belong to the run, not to the database: whoever opens the app or
// regenerates the models next should not find them.
export const dropSeedSnapshot = dropSnapshot

// Every spec file calls this before its own tests, so a suite that mutates
// seeded data cannot decide whether the next spec — or the next browser
// project — passes.
export const resetSeedData = () => {
  if (!ownsSeedData) return

  restoreSnapshot()
}
