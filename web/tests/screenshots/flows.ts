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
const planName = 'Screenshot Plan'
const everybody = ['active', 'new']

// A native confirm() blocks until it is answered, and Playwright dismisses it
// by default, which would silently cancel the deletion.
// Deletions confirm through the app's own sheet (AppConfirmDialog), not a
// native dialog, so the confirm button is clicked like any other control.
const acceptConfirmation = (page: Page) => page.locator('.dialog-confirm').click()

// Which exercise the workout picker offered first, carried between two steps,
// and the workout that was saved, so the cleanup can find it again.
let chosenExercise = ''
let savedWorkout = ''

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
    component: 'src/ui/exercises/CreateExercise.vue',
    name: 'exercise',
    personas: everybody,
    steps: [
      {
        act: async (page) => {
          await page.goto('/exercises/create')
          await page.locator('form input[type="text"]').first().fill(exerciseName)
          await page.getByLabel('Add exercise tag').fill('Upper body')
          await page.getByLabel('Add exercise tag').press('Enter')
          await page.getByLabel('Add exercise tag').fill('Push')
          await page.getByLabel('Add exercise tag').press('Enter')
        },
        name: 'filled',
      },
      {
        act: async (page) => {
          await page.getByRole('button', { name: 'Save Exercise' }).click()
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
    component: 'src/ui/routines/RoutineForm.vue',
    name: 'routine',
    // Choosing exercises is the whole of this form, and the new account has none.
    personas: ['active'],
    steps: [
      {
        act: async (page) => {
          await page.goto('/routines/create')
          await page.getByLabel('Routine name').fill(routineName)
          await page.locator('.exercise-option').first().click()
          await page.locator('.exercise-option').nth(1).click()
          await page.locator('.exercise-option').nth(2).click()
          await expect(page.getByText('3 selected', { exact: true })).toBeVisible()
        },
        name: 'filled',
      },
      {
        act: async (page) => {
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
      await page.goto('/plans')
      const plan = page.getByRole('link', { name: new RegExp(planName) }).first()
      if (!(await present(plan))) return

      await plan.click()
      await page.getByRole('button', { name: 'Delete plan' }).click()
      await acceptConfirmation(page)
      await expect(page).toHaveURL(/\/plans$/)
    },
    component: 'src/ui/plans/PlanForm.vue',
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
          await picker.locator('.routine-options button').first().click()
          await page.getByRole('button', { name: 'Add routine' }).click()
          await page
            .getByRole('dialog', { name: 'Choose a routine' })
            .locator('.routine-options button')
            .first()
            .click()
          await expect(page.locator('.routine-order ol li')).toHaveCount(2)
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
      const actions = page.locator('.menu-trigger').first()
      if (!(await present(actions))) return

      await actions.click()
      await page.getByRole('menuitem', { name: 'Delete workout' }).click()
      await acceptConfirmation(page)
      await expect(page).toHaveURL(/\/home$/)
      savedWorkout = ''
    },
    component: 'src/ui/workouts/StartWorkout.vue',
    name: 'workout',
    personas: ['active'],
    steps: [
      {
        act: async (page) => {
          await page.goto('/workouts/quick')
          await page.getByRole('button', { name: 'Choose exercise' }).click()
          const picker = page.getByRole('dialog', { name: 'Add exercise' })
          const option = picker.locator('.exercise-options button').first()
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
