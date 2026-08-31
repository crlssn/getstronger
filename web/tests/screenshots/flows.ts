import { expect, type Locator, type Page } from '@playwright/test'

// The pages above show the app at rest. These walk the app the way somebody
// building their training does — filling a form, submitting it, and landing on
// what was created — because the state a form is in just before submission, and
// the confirmation that follows, is where a design either holds together or
// does not.
//
// Every flow removes what it created. A full run reseeds anyway, but a filtered
// re-capture does not, and a flow that left its exercise behind would report a
// change on every later comparison.
//
// The workout flow is the one exception to a quiet comparison: its header
// counts the seconds since the workout began, so those captures differ by the
// handful of pixels the clock occupies. Freezing time would make the diff
// quieter at the cost of photographing something the app never shows.

export type FlowStep = {
  // Named for the state it leaves behind, since that is what gets photographed.
  act: (page: Page) => Promise<void>
  name: string
}

export type Flow = {
  cleanup?: (page: Page) => Promise<void>
  component: string
  name: string
  // Flows needing seeded exercises or routines cannot run for the new account.
  personas: string[]
  steps: FlowStep[]
}

const exerciseName = 'Screenshot Press'
const routineName = 'Screenshot Routine'
// A picker's options are the buttons that name something; its close and
// load-more controls carry no name of their own.
const pickerOptions = (page: Page, dialog: ReturnType<Page['getByRole']>) =>
  dialog.getByRole('button').filter({ has: page.locator('strong') })

const circuitName = 'Screenshot Circuit'
const planName = 'Screenshot Plan'

// The builder picks exercises through the same sheet the session uses; each
// group has its own button, and the first one is the block being filled.
const pickExercise = async (page: Page, optionIndex = 0, groupIndex = 0) => {
  await page.getByRole('button', { name: 'Add exercise' }).nth(groupIndex).click()
  const sheet = page.getByRole('dialog')
  // The flows log weight and reps, so the seeded cardio exercise — whose set
  // inputs are distance and time — must never be the one picked.
  const option = pickerOptions(page, sheet).filter({ hasNotText: 'Cardio' }).nth(optionIndex)
  // The session labels its set inputs after the exercise, so what was picked
  // here is what a step training it has to ask for.
  const name = (await option.locator('strong').innerText()).trim()
  await option.click()
  await expect(sheet).toBeHidden()

  return name
}

// One set of a session, filled in. The block decides what the button that logs
// it is called, so the caller presses it.
const logSet = async (page: Page, exercise: string, set: number, weight: string, reps: string) => {
  await page
    .getByRole('textbox', { name: `${exercise} set ${set} weight`, exact: true })
    .fill(weight)
  await page.getByRole('textbox', { name: `${exercise} set ${set} reps`, exact: true }).fill(reps)
}
// A rest is stepped rather than typed, and the two buttons quote the value's own
// name so a screen reader can tell one row's from another's.
const stepRest = (page: Page, name: string, by: 'Add' | 'Subtract') =>
  page
    .getByRole('button', {
      name: `${by} 30 seconds ${by === 'Add' ? 'to' : 'from'} ${name}`,
      exact: true,
    })
    .click()

// The exercises a block holds, as its rows.
const routineExercises = (page: Page) => page.locator('ol > li')

const everybody = ['active', 'new']

// A native confirm() blocks until it is answered, and Playwright dismisses it
// by default, which would silently cancel the deletion.
// Deletions confirm through the app's own sheet (AppConfirmDialog), not a
// native dialog, so the confirm button is clicked like any other control.
// The sheet's actions are ranked, and confirming is always the first of them.
const acceptConfirmation = (page: Page) =>
  page.getByRole('dialog').getByRole('button').first().click()

// Which exercise the workout picker offered first, carried between two steps,
// and the workout that was saved, so the cleanup can find it again.
let chosenExercise = ''
let savedWorkout = ''

// The circuit's own two exercises and the workout it finishes, carried between
// its steps the same way.
let circuitExercises: string[] = []
let savedCircuitWorkout = ''

// Cleanup runs against a list that is still loading, and isVisible() answers
// immediately: asking it first would report the entity as already gone and
// leave it behind.
const present = (locator: Locator) =>
  locator
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)

export const flows: Flow[] = [
  {
    cleanup: async (page) => {
      await page.goto('/exercises')
      await page.getByLabel('Search exercises').fill(exerciseName)
      const exercise = page.getByRole('link').filter({ hasText: exerciseName }).first()
      if (!(await present(exercise))) return

      await exercise.click()
      await page.getByRole('button', { name: 'Exercise actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete exercise' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete exercise' }).click()
      await expect(page).toHaveURL(/\/exercises$/)
    },
    component: 'src/ui/exercises/CreateExercise.tsx',
    name: 'exercise',
    personas: everybody,
    steps: [
      {
        act: async (page) => {
          await page.goto('/exercises/create')
          await page.locator('form input[type="text"]').first().fill(exerciseName)
          await page.getByRole('button', { name: 'Add tags' }).click()
          await page.getByLabel('Add exercise tag').fill('Upper body')
          await page.getByLabel('Add exercise tag').press('Enter')
          await page.getByLabel('Add exercise tag').fill('Push')
          await page.getByLabel('Add exercise tag').press('Enter')
        },
        name: 'filled',
      },
      {
        act: async (page) => {
          await page.getByRole('button', { name: 'Create exercise' }).click()
          await expect(page).toHaveURL(/\/exercises$/)
        },
        name: 'saved',
      },
    ],
  },
  {
    cleanup: async (page) => {
      await page.goto('/routines')
      await page.getByLabel('Search routines').fill(routineName)
      const routine = page.getByRole('heading', { name: routineName }).first()
      if (!(await present(routine))) return

      await routine.click()
      await page.getByRole('button', { name: 'Delete' }).click()
      await acceptConfirmation(page)
      await expect(page).toHaveURL(/\/routines$/)
    },
    component: 'src/ui/routines/RoutineForm.tsx',
    name: 'routine',
    // Choosing exercises is the whole of this form, and the new account has none.
    personas: ['active'],
    steps: [
      {
        act: async (page) => {
          await page.goto('/routines/create')
          await page.getByLabel('Routine name').fill(routineName)
          await pickExercise(page, 0)
          await pickExercise(page, 1)
          await pickExercise(page, 2)
          await expect(routineExercises(page)).toHaveCount(3)
        },
        name: 'filled',
      },
      {
        // The switch is the whole answer for a routine that wants a rest timer
        // and does not care how long, so the folded-away state is one the
        // builder is seen in as often as the open one.
        act: async (page) => {
          await page.getByRole('switch', { name: 'Rest timers' }).click()
          await expect(page.getByLabel(/^Rest between sets of/).first()).toBeHidden()
        },
        name: 'rest-off',
      },
      {
        act: async (page) => {
          // Saved with its timers back on, so the routine below is the one the
          // rest of this flow photographs.
          await page.getByRole('switch', { name: 'Rest timers' }).click()
          await page.getByRole('button', { name: 'Create routine' }).click()
          await expect(page).toHaveURL(/\/routines$/)
          await page.getByLabel('Search routines').fill(routineName)
          await page.getByRole('heading', { name: routineName }).click()
          await expect(page.getByRole('heading', { name: 'Exercise order' })).toBeVisible()
        },
        name: 'saved',
      },
    ],
  },
  {
    cleanup: async (page) => {
      // The workout first: it is what the pages photographed after this flow
      // would otherwise show as the athlete's latest session.
      if (savedCircuitWorkout !== '') {
        await page.goto(savedCircuitWorkout)
        const actions = page.getByRole('button', { name: 'Workout actions' }).first()
        if (await present(actions)) {
          await actions.click()
          await page.getByRole('menuitem', { name: 'Delete workout' }).click()
          await acceptConfirmation(page)
          await expect(page).toHaveURL(/\/home$/)
        }
        savedCircuitWorkout = ''
      }

      await page.goto('/routines')
      await page.getByLabel('Search routines').fill(circuitName)
      const routine = page.getByRole('heading', { name: circuitName }).first()
      if (!(await present(routine))) return

      await routine.click()
      await page.getByRole('button', { name: 'Delete' }).click()
      await acceptConfirmation(page)
      await expect(page).toHaveURL(/\/routines$/)
    },
    component: 'src/ui/routines/RoutineGroupsEditor.tsx',
    // The advanced half of the builder, where exercises are grouped and a group
    // is turned into a circuit. Folded away until it is asked for, so it is only
    // ever seen by walking to it.
    name: 'circuit',
    personas: ['active'],
    steps: [
      {
        act: async (page) => {
          await page.goto('/routines/create')
          await page.getByLabel('Routine name').fill(circuitName)
          circuitExercises = [await pickExercise(page, 0), await pickExercise(page, 1)]

          await page.getByRole('button', { name: 'Advanced', exact: true }).click()
          await page.getByRole('button', { name: 'Circuit', exact: true }).click()
          await stepRest(page, 'Rest after each exercise in group A', 'Subtract')
          await stepRest(page, 'Rest after each round in group A', 'Add')

          // Two groups, since that is where the row runs out of width: the
          // exercise name shares it with the rest, the bin and the handle.
          await page.getByRole('button', { name: 'New group' }).click()
          await pickExercise(page, 0, 1)
        },
        name: 'grouped',
      },
      {
        act: async (page) => {
          await page.getByRole('button', { name: 'Create routine' }).click()
          await expect(page).toHaveURL(/\/routines$/)
          await page.getByLabel('Search routines').fill(circuitName)
          await page.getByRole('heading', { name: circuitName }).click()
          // Matched loosely on purpose. These waits exist to say the page has
          // arrived, and pinning them to the exact wording makes the harness
          // break on precisely the copy changes it is here to photograph — a
          // round count appended to "Circuit" already did it once.
          await expect(page.getByText(/^Circuit\b/).first()).toBeVisible()
        },
        name: 'saved',
      },
      {
        // The session as a circuit is trained: banded by round, and asking for
        // one set rather than for the exercise to be finished with.
        act: async (page) => {
          await page.getByRole('link', { name: 'Start workout' }).click()
          await expect(page.getByText(/^Round 1\b.*exercise 1 of 2$/)).toBeVisible()
        },
        name: 'session',
      },
      {
        // Trained out and saved, because a finished circuit is a page of its
        // own: the session is read round by round rather than as one list of
        // exercises, and nothing else in the set photographs it.
        act: async (page) => {
          const [press, squat] = circuitExercises
          const complete = page.locator('button[type="submit"]')

          // Two rounds, so the saved workout shows the block going round rather
          // than a single pass indistinguishable from straight sets.
          for (const round of [1, 2]) {
            await logSet(page, press ?? '', round, '60', '8')
            await complete.click()
            await logSet(page, squat ?? '', round, '90', '5')
            await complete.click()
          }

          // The block is prescribed for more rounds than were taken, so ending
          // it here is the session's decision to make.
          const endBlock = page.getByRole('button', { name: 'Complete circuit' })
          if (await present(endBlock)) await endBlock.first().click()

          // Group B trains one exercise straight through, and the session is
          // not finished until it is done with too.
          await logSet(page, press ?? '', 1, '70', '6')
          await complete.click()

          await page.getByRole('button', { name: 'Finish workout' }).first().click()
          const dialog = page.getByRole('dialog')
          if (await present(dialog)) {
            await dialog.getByRole('button', { name: /Finish and save|Finish/ }).click()
          }
          await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]{36}$/)
          savedCircuitWorkout = new URL(page.url()).pathname
          // The card's own heading. "Session details" was the eyebrow above it,
          // and an eyebrow above a title is not a rank this app has any more.
          await expect(page.getByRole('heading', { name: 'Exercises', exact: true })).toBeVisible()
        },
        name: 'finished',
      },
    ],
  },
  {
    cleanup: async (page) => {
      await page.goto('/plans')
      const plan = page.getByRole('link', { name: new RegExp(planName) }).first()
      if (!(await present(plan))) return

      await plan.click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await acceptConfirmation(page)
      await expect(page).toHaveURL(/\/plans$/)
    },
    component: 'src/ui/plans/PlanForm.tsx',
    name: 'plan',
    personas: ['active'],
    steps: [
      {
        act: async (page) => {
          await page.goto('/plans/create')
          await page.getByLabel('Plan name').fill(planName)
          await page.getByRole('button', { name: 'Add routine' }).click()
          await expect(page.getByRole('dialog', { name: 'Choose a routine' })).toBeVisible()
        },
        name: 'routine-picker',
      },
      {
        act: async (page) => {
          const picker = page.getByRole('dialog', { name: 'Choose a routine' })
          await pickerOptions(page, picker).first().click()
          await page.getByRole('button', { name: 'Add routine' }).click()
          await page
            .getByRole('dialog', { name: 'Choose a routine' })
            .getByRole('button')
            .filter({ has: page.locator('strong') })
            .first()
            .click()
          await expect(page.getByRole('listitem')).toHaveCount(2)
        },
        name: 'filled',
      },
      {
        act: async (page) => {
          await page.getByRole('button', { name: 'Create plan' }).click()
          await expect(page.getByRole('heading', { name: planName })).toBeVisible()
        },
        name: 'saved',
      },
    ],
  },
  {
    cleanup: async (page) => {
      if (savedWorkout === '') return

      await page.goto(savedWorkout)
      const actions = page.getByRole('button', { name: 'Workout actions' }).first()
      if (!(await present(actions))) return

      await actions.click()
      await page.getByRole('menuitem', { name: 'Delete workout' }).click()
      await acceptConfirmation(page)
      await expect(page).toHaveURL(/\/home$/)
      savedWorkout = ''
    },
    component: 'src/ui/workouts/StartWorkout.tsx',
    name: 'workout',
    personas: ['active'],
    steps: [
      {
        act: async (page) => {
          await page.goto('/workouts/quick')
          await page.getByRole('button', { name: 'Choose exercise' }).click()
          const picker = page.getByRole('dialog', { name: 'Add exercise' })
          // Cardio is skipped for the same reason pickExercise skips it: the
          // next step logs weight and reps.
          const option = pickerOptions(page, picker).filter({ hasNotText: 'Cardio' }).first()
          // The set inputs are labelled after the exercise, so the name chosen
          // here is what the next step has to ask for.
          chosenExercise = (await option.locator('strong').innerText()).trim()
          await option.click()
          await expect(picker).toHaveCount(0)
        },
        name: 'exercise-added',
      },
      {
        act: async (page) => {
          await page
            .getByRole('textbox', { name: `${chosenExercise} set 1 weight`, exact: true })
            .fill('60')
          await page
            .getByRole('textbox', { name: `${chosenExercise} set 1 reps`, exact: true })
            .fill('8')
        },
        name: 'set-logged',
      },
      {
        // A session of one exercise never shows the list it belongs to, so a
        // second one is added here: one open container, one collapsed header.
        act: async (page) => {
          await page.getByRole('button', { name: 'Add exercise' }).click()
          const picker = page.getByRole('dialog', { name: 'Add exercise' })
          await pickerOptions(page, picker).first().click()
          await expect(picker).toHaveCount(0)
        },
        name: 'second-exercise-added',
      },
      {
        act: async (page) => {
          await page.getByRole('button', { name: 'Finish workout' }).click()
          // The confirmation only appears when an exercise is left unfinished.
          // Either way this is the moment before the workout is written.
          await page.waitForTimeout(500)
        },
        name: 'finish-dialog',
      },
      {
        act: async (page) => {
          const dialog = page.getByRole('dialog')
          if (await dialog.isVisible()) {
            await dialog.getByRole('button', { name: /Finish and save|Finish/ }).click()
          }
          await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]{36}$/)
          savedWorkout = new URL(page.url()).pathname
        },
        name: 'saved',
      },
    ],
  },
]

// The teardown orders the contact sheet by the catalogue, so the flow steps
// need names in it too.
export const flowRecords = flows.flatMap((flow) =>
  flow.steps.map((step) => ({ component: flow.component, name: recordName(flow, step) })),
)

export function recordName(flow: Flow, step: FlowStep) {
  return `flow-${flow.name}-${step.name}`
}
