import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * One job per colour, checked rather than remembered.
 *
 * Green once meant five things — streak held, up next, rest running, set
 * logged, and this week's chart bar — and a colour that means five things
 * means nothing. Red meant delete, log out, and you-have-notifications. On a
 * greyscale base ink is already the strongest signal available: "up next" and
 * "streak held" do not need colour, they need weight.
 *
 * Each list below is the set of files allowed to spend that colour, and the
 * comment above it is the job it is spent on. Adding a file here is a design
 * decision, which is the point: it has to be argued for in a diff.
 */
const roles = {
  // Live right now: a rest running, a set just logged. Nothing that merely
  // happened, and nothing that is simply true — with one exception the app
  // makes deliberately, the weekly streak, where the forest green is the
  // card's whole point.
  success: [
    'features/StreakCard.module.css',
    'shell/AppRestTimerBanner.module.css',
    'shell/AppToaster.module.css',
    'workouts/WorkoutRestBanner.module.css',
    'workouts/SetTable.module.css',
  ],
  // Destructive only. Not a notification count, and not a way out of a
  // session. The two auth and input cases are invalid-field states, which is
  // the same "you cannot proceed" the colour already carries.
  danger: [
    'auth/VerifyEmailPending.module.css',
    'components/AppButton.module.css',
    'components/AppErrorState.module.css',
    'components/AppIconButton.module.css',
    'components/AppInput.module.css',
    'components/AppListItem.module.css',
    'components/AppSheet.module.css',
    'components/DropdownButton.module.css',
    'exercises/ExerciseTagsInput.module.css',
    'routines/ViewRoutine.module.css',
    'shell/AppToaster.module.css',
    'workouts/StartWorkout.module.css',
    'workouts/SetTable.module.css',
    'workouts/WorkoutView.module.css',
  ],
  // A personal record. Nothing else.
  record: [
    'ProgressView.module.css',
    'exercises/ViewExercise.module.css',
    'features/CardWorkout.module.css',
    // A circuit is read round by round rather than as a table of sets, so the
    // trophy that marks a record has to travel with it.
    'features/CardWorkoutCircuit.module.css',
    'features/CardWorkoutExercise.module.css',
    // The trophy on a personal-best row, wherever that row is listed.
    'features/RecordRow.module.css',
  ],
}

const uiRoot = join(import.meta.dirname)

const modules = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return modules(path)
    return path.endsWith('.module.css') ? [path] : []
  })

const spenders = (colour: string) =>
  modules(uiRoot)
    .filter((path) =>
      new RegExp(`\\b(bg|text|border|ring|from|to)-${colour}\\b`).test(readFileSync(path, 'utf8')),
    )
    .map((path) => path.slice(uiRoot.length + 1))
    .sort()

describe('the colour roles', () => {
  test.each(Object.entries(roles))('%s is spent only where it has a job', (colour, allowed) => {
    expect(spenders(colour)).toEqual([...allowed].sort())
  })

  // The unread count is drawn in red by choice, so it spends the badge token
  // rather than danger's — the two share a value today and can part company
  // without hunting through 69 files.
  test('the unread badge spends its own token', () => {
    const theme = readFileSync(join(uiRoot, '..', 'assets', 'theme.css'), 'utf8')

    expect(/--color-badge:\s*#[0-9a-f]{6};/.test(theme)).toBe(true)
    expect(spenders('badge')).toEqual([
      'profile/ProfileView.module.css',
      'shell/AppNavBottom.module.css',
    ])
  })
})
