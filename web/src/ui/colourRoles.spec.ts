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
    // A recording's GPS pill: the dot is green while fixes are arriving, which
    // is the only thing on that screen that is happening rather than measured.
    'workouts/RecordSession.module.css',
    // The tick on a row just logged, in a round as in a table of sets.
    'workouts/RoundTable.module.css',
    'workouts/SetTable.module.css',
    // A fix arriving now: the recorder's GPS dot is green only while the last
    // one is fresh and accurate, and grey the moment it is neither.
    'workouts/TimedCircuitRecorder.module.css',
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
    'components/AppInlineError.module.css',
    'components/AppListItem.module.css',
    'components/AppListRow.module.css',
    'components/AppSheet.module.css',
    'components/DropdownButton.module.css',
    'exercises/ExerciseTagsInput.module.css',
    // The danger pattern: an outlined red pill inside the card that explains
    // the consequence — the routine editor set it, plans and the account
    // settings follow it.
    'plans/ViewPlan.module.css',
    'profile/AccountSettings.module.css',
    'routines/ViewRoutine.module.css',
    'workouts/StartWorkout.module.css',
    'workouts/SetTable.module.css',
    'workouts/WorkoutView.module.css',
  ],
  // A personal record. Nothing else.
  record: [
    'ProgressView.module.css',
    // The one PR chip, shared: gold worn as a pill beside a title.
    'components/AppChip.module.css',
    // And the figure counting them: a session's PR total, gold when there is
    // one to count and ordinary ink when there is not.
    'components/AppStat.module.css',
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
const srcRoot = join(uiRoot, '..')

const files = (directory: string, suffix: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return files(path, suffix)
    return path.endsWith(suffix) ? [path] : []
  })

const modules = (directory: string): string[] => files(directory, '.module.css')

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

  // The ink family inverts in the dark palette, so a raw white or black is a
  // colour that means something in one palette and disappears in the other.
  // Text on an ink fill is text-inverse; a card is surface.
  test('no module spends a raw white or black', () => {
    expect(spenders('white')).toEqual([])
    expect(spenders('black')).toEqual([])
  })

  // The same rule, one level down. Every check above matches utility class
  // names, so a colour written as a plain declaration — the 18% white the
  // interval groove was drawn in — walked past all of them. theme.css is the
  // one file where a colour is allowed to be a value rather than a role.
  test('no stylesheet outside the token layer states a colour of its own', () => {
    const tokens = join(srcRoot, 'assets', 'theme.css')
    const offenders = files(srcRoot, '.css')
      .filter(
        (path) =>
          path !== tokens &&
          /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(
            readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
          ),
      )
      .map((path) => path.slice(srcRoot.length + 1))
      .sort()

    expect(offenders).toEqual([])
  })

  // The same rule, in the one place a raw white is spent by saying nothing:
  // Tailwind's --tw-ring-offset-color defaults to #fff, so a ring offset with
  // no colour draws a white gap around every focused control on dark paper.
  test('a ring offset names the colour it is drawn in', () => {
    const srcRoot = join(uiRoot, '..')
    const offenders = [...modules(uiRoot), join(srcRoot, 'assets', 'main.css')]
      .flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(/@apply([^;]+);/g)]
          .filter(
            ([, declaration]) =>
              /ring-offset-[1-9]/.test(declaration) &&
              !/ring-offset-(?![\d.]+\b)[a-z][\w-]*/.test(declaration),
          )
          .map(() => path.slice(srcRoot.length + 1)),
      )
      .sort()

    expect(offenders).toEqual([])
  })

  // Every role has a value in both palettes: a token the dark block misses
  // falls through to its light value and hides on the dark canvas.
  test('the dark palette redefines every colour the light one names', () => {
    const theme = readFileSync(join(uiRoot, '..', 'assets', 'theme.css'), 'utf8')
    const names = (block: string) =>
      [...block.matchAll(/--color-[\w-]+(?=:)/g)].map(([name]) => name).sort()

    const [, light] = /@theme static \{([^}]+)\}/.exec(theme) ?? []
    const [, dark] = /:root\[data-theme='dark'\] \{([^}]+)\}/.exec(theme) ?? []

    expect(light).toBeDefined()
    expect(dark).toBeDefined()
    expect(names(dark ?? '')).toEqual(names(light ?? ''))
  })
})
