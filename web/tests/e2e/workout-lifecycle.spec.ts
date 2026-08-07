import { allowRuntimeErrors, expect, logIn, test, uniqueName } from './fixtures'

const addFirstExercise = async (page: Parameters<typeof logIn>[0]) => {
  await page.getByRole('button', { name: 'Choose exercise' }).click()
  const picker = page.getByRole('dialog', { name: 'Add an exercise' })
  const option = picker.locator('.exercise-options button').first()
  const name = (await option.locator('strong').innerText()).trim()
  await option.click()
  return name
}

const logFirstSet = async (
  page: Parameters<typeof logIn>[0],
  exerciseName: string,
  weight = '25',
  repetitions = '8',
) => {
  await page.getByLabel(`${exerciseName} set 1 weight`).fill(weight)
  await page.getByLabel(`${exerciseName} set 1 repetitions`).fill(repetitions)
}

test.describe('quick workout lifecycle', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('autosaves, resumes, adds exercises, and finishes early with its note @mutation', async ({
    page,
  }) => {
    const note = uniqueName('E2E resumed workout')
    await page.goto('/workouts/quick')

    await expect(page.getByRole('heading', { name: 'Add your first exercise' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add exercise' })).toHaveCount(0)
    await expect(page.getByLabel('Workout note')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeDisabled()

    const firstExercise = await addFirstExercise(page)
    await page.getByLabel(`${firstExercise} set 1 weight`).fill('25')
    await expect(page.getByText('Complete 1 partial set')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeDisabled()
    await page.getByLabel(`${firstExercise} set 1 repetitions`).fill('8')

    await expect(page.getByText('Rest timer', { exact: true })).toBeVisible()
    const initialTimer = await page.locator('.rest-banner p').innerText()
    await page.getByRole('button', { name: '+30 sec' }).click()
    await expect(page.locator('.rest-banner p')).not.toHaveText(initialTimer)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByText('Rest timer', { exact: true })).toHaveCount(0)

    await page.getByLabel('Workout note').fill(note)
    await page.getByRole('button', { name: 'Cancel workout' }).click()
    const leaveDialog = page.getByRole('dialog', { name: 'Leave workout?' })
    await expect(leaveDialog).toBeVisible()
    await leaveDialog.getByRole('button', { name: 'Save & leave' }).click()

    await expect(page).toHaveURL(/\/workout$/)
    await page.getByRole('link', { name: /Resume workout/ }).click()
    await expect(page.getByLabel(`${firstExercise} set 1 weight`)).toHaveValue('25')
    await expect(page.getByLabel(`${firstExercise} set 1 repetitions`)).toHaveValue('8')
    await expect(page.getByLabel('Workout note')).toHaveValue(note)

    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add an exercise' })
    const secondOption = picker.locator('.exercise-options button').first()
    const secondExercise = (await secondOption.locator('strong').innerText()).trim()
    await secondOption.click()
    await expect(page.locator('.exercise-queue')).toContainText(secondExercise)

    await page.getByRole('button', { name: 'Finish workout' }).click()
    const finishDialog = page.getByRole('dialog', { name: 'Finish workout early?' })
    await expect(finishDialog).toContainText('1 exercise unfinished')
    await finishDialog.getByRole('button', { name: 'Finish and save' }).click()

    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Quick Workout', exact: true })).toBeVisible()
    await expect(page.getByText(note, { exact: true })).toBeVisible()
    await expect(page.getByText(firstExercise, { exact: true })).toBeVisible()
    await expect(page.getByText('1 exercise', { exact: true })).toBeVisible()
  })

  test('discards local progress without creating a workout @mutation', async ({ page }) => {
    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    await logFirstSet(page, exercise)
    await page.getByLabel('Workout note').fill('This should be discarded.')

    await page.getByRole('button', { name: 'Cancel workout' }).click()
    await page
      .getByRole('dialog', { name: 'Leave workout?' })
      .getByRole('button', {
        name: 'Discard workout',
      })
      .click()
    const discardDialog = page.getByRole('dialog', { name: 'Delete this workout?' })
    await discardDialog.getByRole('button', { name: 'Discard workout' }).click()

    await expect(page).toHaveURL(/\/workout$/)
    await expect(page.getByRole('link', { name: /Resume workout/ })).toHaveCount(0)
    await page.goto('/workouts/quick')
    await expect(page.getByRole('heading', { name: 'Add your first exercise' })).toBeVisible()
    await expect(page.getByText('This should be discarded.')).toHaveCount(0)
  })

  test('keeps the workout retryable when saving fails @mutation', async ({ page }) => {
    test.info().annotations.push(allowRuntimeErrors)
    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    await logFirstSet(page, exercise)
    await page.getByRole('button', { name: 'Complete exercise' }).click()

    await page.route('**/api.v1.WorkoutService/CreateWorkout', (route) => route.abort())
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(
      page.getByText('Workout could not be saved. Check your connection and try again.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Reopen' }).click()
    await expect(page.getByLabel(`${exercise} set 1 weight`)).toHaveValue('25')
    await page.getByRole('button', { name: 'Complete exercise' }).click()

    await page.unroute('**/api.v1.WorkoutService/CreateWorkout')
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
  })
})

test.describe('planned workouts and history', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('advances only the active plan after a planned workout @mutation', async ({ page }) => {
    const planName = uniqueName('E2E Workout Plan')
    await page.goto('/plans/create')
    await page.getByLabel('Plan name').fill(planName)

    for (let index = 0; index < 2; index += 1) {
      await page.getByRole('button', { name: 'Add routine' }).click()
      await page
        .getByRole('dialog', { name: 'Choose a routine' })
        .locator('.routine-options button')
        .first()
        .click()
    }
    await page.getByRole('button', { name: 'Create plan' }).click()
    await expect(page.getByRole('heading', { name: planName })).toBeVisible()
    const planUrl = page.url()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Make active' }).click()
    await expect(page.getByText('Active plan', { exact: true })).toBeVisible()

    await page.goto('/workout')
    const nextCard = page.locator('.next-card')
    await expect(nextCard).toContainText('1 of 2')
    await nextCard.getByRole('link', { name: /^Start / }).click()

    const exercise = (await page.locator('.exercise-card h2').innerText()).trim()
    await logFirstSet(page, exercise, '30', '6')
    await page.getByRole('button', { name: /Next exercise|Complete exercise/ }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()
    const finishDialog = page.getByRole('dialog', { name: 'Finish workout early?' })
    if (await finishDialog.isVisible()) {
      await finishDialog.getByRole('button', { name: 'Finish and save' }).click()
    }
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)

    await page.goto('/workout')
    await expect(page.locator('.next-card')).toContainText('2 of 2')

    await page.goto('/plans')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('heading', { name: 'No active plan' })).toBeVisible()
    await page.goto(planUrl)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete plan' }).click()
    await expect(page).toHaveURL(/\/plans$/)
  })

  test('loads previous workouts to a clear end state and opens a summary', async ({ page }) => {
    await page.goto('/workout')
    const history = page.locator('.workout-history')
    await expect(history.getByRole('heading', { name: 'Previous workouts' })).toBeVisible()
    await expect(history.getByRole('link')).not.toHaveCount(0)
    await expect(history.getByRole('status')).toContainText('reached the end')

    const firstWorkoutName = (
      await history.getByRole('link').first().locator('strong').innerText()
    ).trim()
    await history.getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: firstWorkoutName, exact: true })).toBeVisible()
    await expect(page.getByText('Completed workout', { exact: true })).toBeVisible()
  })
})
