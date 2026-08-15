import {
  allowRuntimeErrors,
  expect,
  logIn,
  logInAs,
  resetSeedData,
  scrollToListEnd,
  test,
  uniqueName,
} from './fixtures'

test.beforeAll(resetSeedData)

const addFirstExercise = async (page: Parameters<typeof logIn>[0]) => {
  await page.getByRole('button', { name: 'Choose exercise' }).click()
  const picker = page.getByRole('dialog', { name: 'Add exercise' })
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
  await page
    .getByRole('textbox', { name: `${exerciseName} set 1 weight`, exact: true })
    .fill(weight)
  await page
    .getByRole('textbox', { name: `${exerciseName} set 1 Reps`, exact: true })
    .fill(repetitions)
}

test.describe('quick workout lifecycle', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('autosaves, resumes, adds exercises, and finishes early with its note @mutation', async ({
    page,
  }) => {
    const note = uniqueName('E2E resumed workout')
    await page.goto('/workouts/quick')

    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add your first exercise' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add exercise' })).toHaveCount(0)
    await expect(page.getByLabel('Workout note')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeDisabled()

    const firstExercise = await addFirstExercise(page)
    await page
      .getByRole('textbox', { name: `${firstExercise} set 1 weight`, exact: true })
      .fill('25')
    await expect(
      page.getByRole('button', { name: 'Finish workout: Complete 1 partial set' }),
    ).toBeDisabled()
    await page.getByRole('textbox', { name: `${firstExercise} set 1 Reps`, exact: true }).fill('8')

    await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()
    const initialTimer = await page.locator('.rest-banner p').innerText()
    await page.getByRole('button', { name: '+30 sec' }).click()
    await expect(page.locator('.rest-banner p')).not.toHaveText(initialTimer)
    const extendedTimer = await page.locator('.rest-banner p').innerText()

    await page.getByLabel('Workout note').fill(note)
    await page.getByRole('button', { name: 'Leave workout?' }).click()
    const leaveDialog = page.getByRole('dialog', { name: 'Leave workout?' })
    await expect(leaveDialog).toBeVisible()
    await leaveDialog.getByRole('button', { name: 'Save & leave' }).click()

    await expect(page).toHaveURL(/\/workout$/)
    await page.goto('/home')
    const workoutNavigation = page.locator('.bottom-nav').getByRole('link', { name: 'Workout' })
    await expect(workoutNavigation.locator('.timer-badge')).toHaveText(/^\d+:\d{2}$/)
    await page.waitForTimeout(1100)
    await page.getByRole('link', { name: /Resume workout/ }).click()
    await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()
    await expect(page.locator('.rest-banner p')).not.toHaveText(extendedTimer)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Rest timer' })).toHaveCount(0)
    await page.goto('/home')
    await expect(workoutNavigation.locator('.timer-badge')).toHaveText(/^\d+m \d{2}s$/)
    await workoutNavigation.click()
    await expect(
      page.getByRole('textbox', { name: `${firstExercise} set 1 weight`, exact: true }),
    ).toHaveValue('25')
    await expect(
      page.getByRole('textbox', { name: `${firstExercise} set 1 Reps`, exact: true }),
    ).toHaveValue('8')
    await expect(page.getByLabel('Workout note')).toHaveValue(note)

    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    const secondOption = picker.locator('.exercise-options button').first()
    const secondExercise = (await secondOption.locator('strong').innerText()).trim()
    await secondOption.click()
    await expect(page.locator('.exercise-queue')).toContainText(secondExercise)

    await page.getByRole('button', { name: 'Finish workout' }).click()
    const finishDialog = page.getByRole('dialog', { name: 'Finish workout early?' })
    await expect(finishDialog).toContainText('1 exercise unfinished')
    await finishDialog.getByRole('button', { name: 'Finish and save' }).click()

    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
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

    await page.getByRole('button', { name: 'Leave workout?' }).click()
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
    await expect(
      page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }),
    ).toHaveValue('25')
    await page.getByRole('button', { name: 'Complete exercise' }).click()

    await page.unroute('**/api.v1.WorkoutService/CreateWorkout')
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
  })
})

test.describe('weight units', () => {
  test('cascades unit changes and preserves each entered unit in workout and PB views @mutation', async ({
    page,
  }) => {
    await logInAs(page, 'active@getstronger.test', 'password123')
    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    const weight = page.getByRole('textbox', {
      name: `${exercise} set 1 weight`,
      exact: true,
    })
    const unit = page.getByRole('group', { name: `${exercise} set 1 weight unit` })

    await expect(unit.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
    await weight.fill('45.36')
    await page.getByLabel(`${exercise} set 1 Reps`).fill('8')
    const secondWeight = page.getByRole('textbox', {
      name: `${exercise} set 2 weight`,
      exact: true,
    })
    const secondUnit = page.getByRole('group', { name: `${exercise} set 2 weight unit` })

    await unit.getByRole('button', { name: 'lbs' }).click()
    await expect(weight).toHaveValue('100')
    await expect(secondUnit.getByRole('button', { name: 'lbs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await secondWeight.fill('110')
    await page.getByLabel(`${exercise} set 2 Reps`).fill('6')
    const thirdUnit = page.getByRole('group', { name: `${exercise} set 3 weight unit` })
    await expect(thirdUnit.getByRole('button', { name: 'lbs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await secondUnit.getByRole('button', { name: 'kg' }).click()
    await expect(secondWeight).toHaveValue('49.9')
    await expect(unit.getByRole('button', { name: 'lbs' })).toHaveAttribute('aria-pressed', 'true')
    await expect(thirdUnit.getByRole('button', { name: 'kg' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Heavier than anything seeded so this set becomes the exercise's personal
    // best and the records view has to render it back in the unit it was
    // entered in.
    await page.getByRole('textbox', { name: `${exercise} set 3 weight`, exact: true }).fill('150')
    await page.getByLabel(`${exercise} set 3 Reps`).fill('5')
    await thirdUnit.getByRole('button', { name: 'lbs' }).click()
    await expect(
      page.getByRole('textbox', { name: `${exercise} set 3 weight`, exact: true }),
    ).toHaveValue('330.69')

    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()

    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('status')).toContainText('Workout saved')
    const notificationBox = await page.locator('.alert-region').boundingBox()
    expect(notificationBox?.x).toBe(0)
    expect(notificationBox?.width).toBe(390)
    await expect(page.getByText(/100\s*lbs/)).toBeVisible()
    await expect(page.getByText(/49\.9\s*kg/)).toBeVisible()
    await expect(page.getByText(/330\.69\s*lbs/)).toBeVisible()

    await page.goto('/progress')
    await expect(page.locator('.record-value').filter({ hasText: /330\.69\s*lbs/ })).toBeVisible()

    await page.goto('/home')
    const currentWeek = page.locator('.week-block.current.complete')
    await expect(currentWeek.locator('svg')).toBeVisible()
    await expect(currentWeek.locator('.week-workout-count')).toHaveText(/^(?:[2-8]|9\+)$/)
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

    // Seeded routines vary in length. One with a further exercise opens it on
    // an empty set that blocks finishing until it is removed; a single-exercise
    // routine is already finishable.
    const finishWorkout = page.getByRole('button', { name: 'Finish workout' })
    const removeFirstSet = page.getByRole('button', { name: 'Remove set 1' })
    await expect
      .poll(async () => (await removeFirstSet.count()) > 0 || (await finishWorkout.isEnabled()))
      .toBe(true)
    if ((await removeFirstSet.count()) > 0) await removeFirstSet.click()

    await expect(finishWorkout).toBeEnabled()
    await finishWorkout.click()
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
    await scrollToListEnd(page, '.history-end')
    await expect(history.getByRole('status')).toContainText('reached the end')

    const firstWorkoutName = (
      await history.getByRole('link').first().locator('strong').innerText()
    ).trim()
    await history.getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: firstWorkoutName, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Alex Morgan', exact: true }).first()).toBeVisible()
    await expect(page.getByText('Completed workout', { exact: true })).toBeVisible()
  })
})
