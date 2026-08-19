import {
  allowRuntimeErrors,
  boxOf,
  expect,
  logIn,
  logInAs,
  openExerciseActions,
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
    .getByRole('textbox', { name: `${exerciseName} set 1 reps`, exact: true })
    .fill(repetitions)
}

test.describe('quick workout lifecycle', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('autosaves, resumes, adds exercises, and finishes early with its note @mutation', async ({
    page,
  }) => {
    const note = uniqueName('E2E resumed workout')
    await page.goto('/workouts/quick')

    // The focused shell takes over: global navigation is gone and the session
    // chrome stays one band, now carrying the elapsed time — the one number
    // read between sets — and a rail for how far through the session you are.
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0)
    const headerBox = await page.locator('.workout-header').boundingBox()
    expect(headerBox?.height).toBeLessThanOrEqual(80)
    await expect(page.getByRole('progressbar', { name: 'Session progress' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add your first exercise' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add exercise' })).toHaveCount(0)
    await expect(page.getByLabel('Workout note')).toHaveCount(0)
    // Blocked, not disabled: the dominant control stays pressable and names
    // what is missing, rather than greying out and reading as broken.
    await expect(page.locator('.primary-action')).toBeEnabled()
    await page.locator('.primary-action').click()
    await expect(page.locator('.finish-dock > strong')).toHaveText(
      'Add an exercise before moving on',
    )

    const firstExercise = await addFirstExercise(page)
    await page
      .getByRole('textbox', { name: `${firstExercise} set 1 weight`, exact: true })
      .fill('25')
    await expect(
      page.getByRole('button', { name: 'Finish workout: Complete 1 partial set' }),
    ).toBeDisabled()
    await page.getByRole('textbox', { name: `${firstExercise} set 1 reps`, exact: true }).fill('8')

    const restRegion = page.getByRole('region', { name: 'Rest timer' })
    await expect(restRegion).toBeVisible()
    const restCountdown = restRegion.locator('strong').first()
    const initialTimer = await restCountdown.innerText()
    expect(initialTimer).toMatch(/^\d{2}:\d{2}$/)
    // The band owns the top of the screen and covers no editable field.
    const bannerBox = await restRegion.boundingBox()
    const repsBox = await page
      .getByRole('textbox', { name: `${firstExercise} set 1 reps`, exact: true })
      .boundingBox()
    expect(bannerBox!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width)
    expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(repsBox!.y)

    await page.getByRole('button', { name: '+30 sec' }).click()
    await expect(restCountdown).not.toHaveText(initialTimer)
    const extendedTimer = await restCountdown.innerText()

    await page.getByLabel('Workout note').fill(note)
    await page.getByRole('button', { name: 'Leave workout?' }).click()
    const leaveDialog = page.getByRole('dialog', { name: 'Leave workout?' })
    await expect(leaveDialog).toBeVisible()
    await leaveDialog.getByRole('button', { name: 'Stay' }).click()
    await expect(leaveDialog).toHaveCount(0)
    await expect(page).toHaveURL(/\/workouts\/quick$/)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Leave workout?' }).click()
    await page
      .getByRole('dialog', { name: 'Leave workout?' })
      .getByRole('button', { name: 'Save & leave' })
      .click()

    await expect(page).toHaveURL(/\/workout$/)
    // Leaving the session hands the global navigation back.
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    await page.goto('/home')
    const workoutNavigation = page.locator('.bottom-nav').getByRole('link', { name: 'Workout' })
    await expect(workoutNavigation.locator('.timer-badge')).toHaveText(/^\d+:\d{2}$/)
    await page.waitForTimeout(1100)
    await page.getByRole('link', { name: /Resume workout/ }).click()
    await expect(restRegion).toBeVisible()
    await expect(restCountdown).not.toHaveText(extendedTimer)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(restRegion).toHaveCount(0)
    await page.goto('/home')
    await expect(workoutNavigation.locator('.timer-badge')).toHaveText(/^\d+m \d{2}s$/)
    await workoutNavigation.click()
    await expect(
      page.getByRole('textbox', { name: `${firstExercise} set 1 weight`, exact: true }),
    ).toHaveValue('25')
    await expect(
      page.getByRole('textbox', { name: `${firstExercise} set 1 reps`, exact: true }),
    ).toHaveValue('8')
    await expect(page.getByLabel('Workout note')).toHaveValue(note)

    // A completed set stays correctable in place.
    const weightInput = page.getByRole('textbox', {
      name: `${firstExercise} set 1 weight`,
      exact: true,
    })
    await weightInput.fill('26')
    await expect(weightInput).toHaveValue('26')

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
    await expect(page.getByRole('heading', { name: 'Quick workout', exact: true })).toBeVisible()
    await expect(page.getByText(note, { exact: true })).toBeVisible()
    await expect(page.getByText(firstExercise, { exact: true })).toBeVisible()
    await expect(page.getByText('1 exercise', { exact: true })).toBeVisible()
    await expect(page.getByText(/26\s*kg/)).toBeVisible()

    // The save confirmation spans the viewport rather than sitting inset.
    await expect(page.getByRole('status')).toContainText('Workout saved')
    const notificationBox = await boxOf(page.locator('.alert-region'))
    expect(notificationBox.x).toBe(0)
    expect(notificationBox.width).toBe(390)

    // Finishing a workout marks the current week complete on the home streak.
    await page.goto('/home')
    const currentWeek = page.locator('.week-block.current.complete')
    await expect(currentWeek.locator('svg')).toBeVisible()
    await expect(currentWeek.locator('.week-workout-count')).toHaveText(/^(?:[2-8]|9\+)$/)
  })

  test('promotes previous-session values into the set rows @mutation', async ({ page }) => {
    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    await logFirstSet(page, exercise, '25', '8')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)

    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    await picker.getByRole('searchbox').fill(exercise)
    await picker.locator('.exercise-options button').first().click()

    const firstRow = page.locator('.set-row').first()
    await expect(firstRow.locator('.previous-value')).toContainText('25')
    const weight = page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true })
    // Focusing an empty field offers the previous value without retyping.
    await weight.focus()
    await expect(weight).toHaveValue('25')

    await page.getByRole('textbox', { name: `${exercise} set 1 reps`, exact: true }).fill('8')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByText(/25\s*kg/)).toBeVisible()
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
  test('changing the profile preference sets a static suffix, keeps history correct, and persists across sign-in @mutation', async ({
    page,
  }) => {
    await logInAs(page, 'active@getstronger.test', 'password123')

    // Weight unit is a profile preference, not a per-set choice: a set row
    // shows a static suffix, not a toggle.
    await page.goto('/workouts/quick')
    let exercise = await addFirstExercise(page)
    let weightEntry = page.locator('.unit-entry').first()
    await expect(weightEntry.locator('.unit-suffix')).toHaveText('kg')
    await expect(weightEntry.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('group', { name: /weight unit/ })).toHaveCount(0)

    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).fill('60')
    await page.getByLabel(`${exercise} set 1 reps`).fill('8')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByText(/60\s*kg/)).toBeVisible()

    // Switch the preference from profile settings.
    await page.goto('/profile')
    const unit = page.getByRole('group', { name: 'Preferred weight unit' })
    await expect(unit.getByRole('button', { name: 'Kilograms' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await unit.getByRole('button', { name: 'Pounds' }).click()
    await expect(unit.getByRole('button', { name: 'Pounds' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('status')).toContainText('Weight unit updated')

    // New set inputs pick up the new preference as a static suffix.
    await page.goto('/workouts/quick')
    exercise = await addFirstExercise(page)
    weightEntry = page.locator('.unit-entry').first()
    await expect(weightEntry.locator('.unit-suffix')).toHaveText('lbs')

    // Heavier than anything seeded so this set becomes the exercise's personal
    // best and the records view has to render it back in the unit it was
    // entered in.
    await page
      .getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true })
      .fill('330.69')
    await page.getByLabel(`${exercise} set 1 reps`).fill('5')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()

    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('status')).toContainText('Workout saved')
    await expect(page.getByText(/330\.69\s*lbs/)).toBeVisible()

    await page.goto('/progress')
    await expect(page.locator('.record-value').filter({ hasText: /330\.69\s*lbs/ })).toBeVisible()

    // Switching back to kilograms must not rewrite the set logged in pounds:
    // historical display stays correct even after the preference changes.
    await page.goto('/profile')
    const kgAgain = page.getByRole('group', { name: 'Preferred weight unit' })
    await kgAgain.getByRole('button', { name: 'Kilograms' }).click()
    await expect(kgAgain.getByRole('button', { name: 'Kilograms' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.goto('/progress')
    await expect(page.locator('.record-value').filter({ hasText: /330\.69\s*lbs/ })).toBeVisible()

    await page.goto('/workouts/quick')
    exercise = await addFirstExercise(page)
    weightEntry = page.locator('.unit-entry').first()
    await expect(weightEntry.locator('.unit-suffix')).toHaveText('kg')
    await page.getByRole('button', { name: 'Leave workout?' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()

    // The preference is a signed-in server value, not device-local state: it
    // survives a fresh sign-in, not just a reload of the current session.
    await page.goto('/logout')
    await logInAs(page, 'active@getstronger.test', 'password123')
    await page.goto('/profile')
    await expect(
      page.getByRole('group', { name: 'Preferred weight unit' }).getByRole('button', {
        name: 'Kilograms',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  // A draft outlives the page: "Save & leave" keeps it in local storage, so the
  // preference can change before the athlete returns to finish the workout.
  test('converts an in-progress draft when the preference changes mid-workout @mutation', async ({
    page,
  }) => {
    await logInAs(page, 'active@getstronger.test', 'password123')

    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    const weight = page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true })
    await weight.fill('100')
    await page.getByLabel(`${exercise} set 1 reps`).fill('5')

    await page.getByRole('button', { name: 'Leave workout?' }).click()
    await page.getByRole('button', { name: 'Save & leave' }).click()

    await page.goto('/profile')
    await page
      .getByRole('group', { name: 'Preferred weight unit' })
      .getByRole('button', { name: 'Pounds' })
      .click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')

    // 100 kg is the same weight as 220.46 lb. The row must never show the old
    // number beside the new unit, or finishing saves a weight nobody entered.
    await page.goto('/workouts/quick')
    await expect(page.locator('.unit-entry .unit-suffix').first()).toHaveText('lbs')
    await expect(
      page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }),
    ).toHaveValue('220.46')

    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByText(/220\.46\s*lbs/)).toBeVisible()

    // Restore the seeded default so the preference does not leak into the
    // tests that follow.
    await page.goto('/profile')
    await page
      .getByRole('group', { name: 'Preferred weight unit' })
      .getByRole('button', { name: 'Kilograms' })
      .click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')
  })

  test('logs distance and time in the preferred unit and keeps history in the entered unit @mutation', async ({
    page,
  }) => {
    await logInAs(page, 'active@getstronger.test', 'password123')
    const exerciseName = uniqueName('E2E Evening Run')

    // Creating the exercise shows the account's distance unit on the
    // measurement card, so the athlete knows what a set will be logged in.
    await page.goto('/exercises/create')
    await page.locator('form input[type="text"]').first().fill(exerciseName)
    await expect(page.locator('.measurement').filter({ hasText: 'Distance' })).toContainText('km')
    await page.getByRole('button', { name: 'Distance × time' }).click()
    await page.getByRole('button', { name: 'Save Exercise' }).click()
    await expect(page).toHaveURL(/\/exercises$/)

    try {
      await page.goto('/profile')
      const unit = page.getByRole('group', { name: 'Preferred distance unit' })
      await expect(unit.getByRole('button', { name: 'Kilometers' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await unit.getByRole('button', { name: 'Miles' }).click()
      await expect(unit.getByRole('button', { name: 'Miles' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByRole('status')).toContainText('Distance unit updated')

      await page.goto('/workouts/quick')
      await page.getByRole('button', { name: 'Choose exercise' }).click()
      const picker = page.getByRole('dialog', { name: 'Add exercise' })
      await picker.getByLabel('Search exercises').fill(exerciseName)
      await picker.locator('.exercise-options button').first().click()

      // Distance is a decimal field carrying the preference as a static
      // suffix; time is a stopwatch-style field where bare digits fill in
      // from the right, so "1230" reads as 12:30.
      await expect(page.locator('.unit-entry .unit-suffix').first()).toHaveText('mi')
      await page
        .getByRole('textbox', { name: `${exerciseName} set 1 distance`, exact: true })
        .fill('3.5')
      const time = page.getByRole('textbox', { name: `${exerciseName} set 1 time`, exact: true })
      await time.fill('1230')
      await time.blur()
      await expect(time).toHaveValue('12:30')

      await page.getByRole('button', { name: 'Complete exercise' }).click()
      await page.getByRole('button', { name: 'Finish workout' }).click()
      await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
      const workoutUrl = page.url()
      // The completed view splits the duration into units and derives a pace
      // from the set's own distance unit: 12:30 over 3.5 mi is 3:34 min/mi.
      await expect(page.getByText(/3\.5\s*mi/)).toBeVisible()
      await expect(page.getByText('12 min 30 sec')).toBeVisible()
      await expect(page.getByText('3:34 min/mi')).toBeVisible()

      // Switching back to kilometers must not rewrite the set logged in
      // miles: historical display stays in the unit it was entered in.
      await page.goto('/profile')
      await unit.getByRole('button', { name: 'Kilometers' }).click()
      await expect(page.getByRole('status')).toContainText('Distance unit updated')

      await page.goto(workoutUrl)
      await expect(page.getByText(/3\.5\s*mi/)).toBeVisible()
    } finally {
      await page.goto('/profile')
      const unit = page.getByRole('group', { name: 'Preferred distance unit' })
      if (
        (await unit.getByRole('button', { name: 'Kilometers' }).getAttribute('aria-pressed')) !==
        'true'
      ) {
        await unit.getByRole('button', { name: 'Kilometers' }).click()
        await expect(page.getByRole('status')).toContainText('Distance unit updated')
      }

      await page.goto('/exercises')
      await page.getByLabel('Search exercises').fill(exerciseName)
      const link = page.getByRole('link').filter({ hasText: exerciseName }).first()
      if (await link.isVisible()) {
        await link.click()
        await openExerciseActions(page)
        await page.getByRole('menuitem', { name: 'Delete exercise' }).click()
        await page.getByRole('dialog').getByRole('button', { name: 'Delete exercise' }).click()
        await expect(page).toHaveURL(/\/exercises$/)
      }
    }
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
