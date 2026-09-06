import type { Page } from '@playwright/test'

import { expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

const email = process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'active@getstronger.test'
const password = process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? 'password123'

/** The labels one locale renders the create-and-train journey with. */
interface Labels {
  name: string
  library: string
  create: string
  chooseExercise: string
  addExercise: string
  completeExercise: string
  finish: string
  finishAndSave: string
  weight: string
  reps: string
}

const english: Labels = {
  name: 'Name',
  library: 'From the library',
  create: 'Create exercise',
  chooseExercise: 'Choose exercise',
  addExercise: 'Add exercise',
  completeExercise: 'Complete exercise',
  finish: 'Finish workout',
  finishAndSave: 'Finish and save',
  weight: 'weight',
  reps: 'reps',
}

const swedish: Labels = {
  name: 'Namn',
  library: 'Ur övningsbiblioteket',
  create: 'Skapa övning',
  chooseExercise: 'Välj övning',
  addExercise: 'Lägg till övning',
  completeExercise: 'Slutför övningen',
  finish: 'Avsluta träningspass',
  finishAndSave: 'Avsluta och spara',
  weight: 'vikt',
  reps: 'reps',
}

// The shared logIn helper finds its fields by their English labels, which a
// Swedish-locale browser no longer renders.
const logInInSwedish = async (page: Page) => {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/home$/)
}

/**
 * Creates an exercise by picking a library entry, then trains it, so the entry
 * that filled the form is the one a logged set ends up against.
 */
const createFromLibraryAndTrain = async (
  page: Page,
  labels: Labels,
  query: string,
  entryName: string,
) => {
  await page.goto('/exercises/create')
  await page.getByRole('textbox', { name: labels.name, exact: true }).fill(query)

  await expect(page.getByRole('heading', { name: labels.library })).toBeVisible()
  await page.getByRole('button').filter({ hasText: entryName }).first().click()

  // Filled in, not settled: the name, the measurements and the tags are all
  // still editable, and the tags the entry brought are on show.
  await expect(page.getByRole('textbox', { name: labels.name, exact: true })).toHaveValue(entryName)
  await page.getByRole('button', { name: labels.create }).click()
  await expect(page).toHaveURL(/\/exercises$/)

  await page.goto('/workouts/quick')
  await page.getByRole('button', { name: labels.chooseExercise }).click()
  const picker = page.getByRole('dialog', { name: labels.addExercise })
  await picker.getByRole('searchbox').fill(entryName)
  await picker
    .getByRole('button')
    .filter({ has: page.locator('strong') })
    .filter({ hasText: entryName })
    .first()
    .click()

  await page
    .getByRole('textbox', { name: `${entryName} set 1 ${labels.weight}`, exact: true })
    .fill('60')
  await page
    .getByRole('textbox', { name: `${entryName} set 1 ${labels.reps}`, exact: true })
    .fill('5')
  await page.getByRole('button', { name: labels.completeExercise }).click()
  await page.getByRole('button', { name: labels.finish }).click()
  await page.getByRole('dialog').getByRole('button', { name: labels.finishAndSave }).click()

  await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
  await expect(page.getByText(entryName).first()).toBeVisible()
  await expect(page.getByText(/60\s*kg/).first()).toBeVisible()
}

// Everything this file creates is put back by the snapshot restore that every
// spec file runs before its own tests.
test.describe('picking an exercise out of the library', () => {
  test('fills the form, saves, and reaches a logged set @mutation', async ({ page }) => {
    await logIn(page)
    await createFromLibraryAndTrain(page, english, 'romanian dead', 'Barbell Romanian deadlift')
  })

  test.describe('in Swedish', () => {
    test.use({ locale: 'sv-SE' })

    // Typed in English, offered in Swedish: the library is searched in the
    // reader's locale and in English, so "bench" still finds the bench press
    // for someone reading Swedish — and what it saves is the Swedish name.
    test('matches an English word and saves the Swedish name @mutation', async ({ page }) => {
      await logInInSwedish(page)
      await createFromLibraryAndTrain(page, swedish, 'bench', 'Bänkpress med skivstång')
    })
  })
})
