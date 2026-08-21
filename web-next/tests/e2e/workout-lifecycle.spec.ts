import {
  acceptConfirmDialog,
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

// Shared handles for a screen built almost entirely of anonymous grid cells.
type E2EPage = Parameters<typeof logIn>[0]

// The picker's options are the buttons that name something; its close and
// load-more controls carry no name of their own.
const pickerOptions = (page: E2EPage, dialog: ReturnType<E2EPage['getByRole']>) =>
  dialog.getByRole('button').filter({ has: page.locator('strong') })

const openExerciseName = async (page: E2EPage) =>
  (await page.getByRole('button', { expanded: true }).locator('strong').innerText()).trim()

// The unit is a label on the field, so it lives in the field's own box beside
// the input rather than anywhere nameable.
const unitFieldFor = (page: E2EPage, label: string) =>
  page.getByRole('textbox', { name: label, exact: true }).locator('xpath=..')

const setRow = (page: E2EPage, number: number) =>
  page.getByRole('button', { name: `Remove set ${number}` }).locator('xpath=..')

const sectionWithHeading = (page: E2EPage, heading: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) })

const addFirstExercise = async (page: Parameters<typeof logIn>[0]) => {
  await page.getByRole('button', { name: 'Choose exercise' }).click()
  const picker = page.getByRole('dialog', { name: 'Add exercise' })
  const option = pickerOptions(page, picker).first()
  const name = (await option.locator('strong').innerText()).trim()
  await option.click()
  return name
}

// Finishing always pauses on the confirmation sheet that carries the note.
const finishAndSave = async (page: Parameters<typeof logIn>[0]) => {
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
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
    // chrome stays one band, carrying the elapsed time — the one number read
    // between sets. No progress rail: a glance should not do arithmetic.
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0)
    // Not a banner: the session runs inside the shell's <main>, which takes the
    // role away. It is the form's own header.
    const headerBox = await page.locator('form > header').boundingBox()
    expect(headerBox?.height).toBeLessThanOrEqual(80)
    await expect(page.getByRole('progressbar', { name: 'Session progress' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Add your first exercise' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add exercise' })).toHaveCount(0)
    await expect(page.getByLabel('Workout note')).toHaveCount(0)
    // Until an exercise exists there is nothing to complete: the empty state
    // leads with choosing one, and no primary action competes with it.
    await expect(page.locator('button[type="submit"]')).toHaveCount(0)

    const firstExercise = await addFirstExercise(page)
    // Blocked, not disabled: the dominant control stays pressable and names
    // what is missing, rather than greying out and reading as broken.
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
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

    // The note lives in the finish sheet; write it there and keep training.
    await page.getByRole('button', { name: 'Finish workout' }).click()
    const noteDialog = page.getByRole('dialog', { name: 'Finish workout early?' })
    await noteDialog.getByLabel('Workout note').fill(note)
    await noteDialog.getByRole('button', { name: 'Keep training' }).click()
    await expect(noteDialog).toHaveCount(0)

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
      .getByRole('button', { name: 'Continue in the background' })
      .click()

    // Continuing in the background lands on home; the workout tab's timer
    // badge is the way back into the running session.
    await expect(page).toHaveURL(/\/home$/)
    // Leaving the session hands the global navigation back.
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    const workoutNavigation = page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Workout' })
    // The ticking duration is decorative, so it is the tab's one hidden span.
    const timerBadge = workoutNavigation.locator('span[aria-hidden="true"]')
    await expect(timerBadge).toHaveText(/^\d+:\d{2}$/)
    await page.waitForTimeout(1100)
    await workoutNavigation.click()
    await expect(restRegion).toBeVisible()
    await expect(restCountdown).not.toHaveText(extendedTimer)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(restRegion).toHaveCount(0)
    await page.goto('/home')
    await expect(timerBadge).toHaveText(/^\d+m \d{2}s$/)
    await workoutNavigation.click()
    await expect(
      page.getByRole('textbox', { name: `${firstExercise} set 1 weight`, exact: true }),
    ).toHaveValue('25')
    await expect(
      page.getByRole('textbox', { name: `${firstExercise} set 1 reps`, exact: true }),
    ).toHaveValue('8')
    // The note written before leaving is still waiting in the finish sheet.
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await expect(page.getByLabel('Workout note')).toHaveValue(note)
    await page.getByRole('button', { name: 'Keep training' }).click()

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
    const secondOption = pickerOptions(page, picker).first()
    const secondExercise = (await secondOption.locator('strong').innerText()).trim()
    await secondOption.click()
    await expect(
      page.locator('button[aria-expanded]').filter({ hasText: secondExercise }),
    ).toHaveCount(1)

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
    // The card spans the viewport; the region around it is what carries that.
    const notificationBox = await boxOf(page.getByRole('status').locator('xpath=..'))
    expect(notificationBox.x).toBe(0)
    expect(notificationBox.width).toBe(390)

    // Finishing a workout marks the current week complete on the home streak.
    await page.goto('/home')
    // Each week square names itself and its state, which is a better handle
    // than the classes that colour it.
    const currentWeek = page.getByRole('listitem', {
      name: /^This week: \d+ workouts? logged$/,
    })
    await expect(currentWeek.locator('svg')).toBeVisible()
    await expect(currentWeek.locator('strong')).toHaveText(/^(?:[2-8]|9\+)$/)
  })

  test('promotes previous-session values into the set rows @mutation', async ({ page }) => {
    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    await logFirstSet(page, exercise, '25', '8')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await finishAndSave(page)
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)

    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    await picker.getByRole('searchbox').fill(exercise)
    await pickerOptions(page, picker).first().click()

    // The previous column is the second of the row's two spans, after the set
    // number: read-only, and named by nothing.
    await expect(setRow(page, 1).locator(':scope > span').nth(1)).toContainText('25')
    const weight = page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true })
    // The prefill is off until the account asks for it: what the row shows is
    // the previous column, not a value nobody typed.
    await weight.focus()
    await expect(weight).toHaveValue('')

    await page.goto('/profile')
    await page
      .getByRole('group', { name: 'Repeat my last set' })
      .getByRole('button', { name: 'On' })
      .click()
    await expect(page.getByRole('status')).toContainText('Set prefill updated')

    await page.goto('/workouts/quick')
    // Focusing an empty field now offers the previous value without retyping.
    await weight.focus()
    await expect(weight).toHaveValue('25')

    await page.getByRole('textbox', { name: `${exercise} set 1 reps`, exact: true }).fill('8')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await finishAndSave(page)
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByText(/25\s*kg/)).toBeVisible()
  })

  test('discards local progress without creating a workout @mutation', async ({ page }) => {
    await page.goto('/workouts/quick')
    const exercise = await addFirstExercise(page)
    await logFirstSet(page, exercise)
    // Write a note through the finish sheet, then abandon it all.
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByLabel('Workout note').fill('This should be discarded.')
    await page.getByRole('button', { name: 'Keep training' }).click()

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
    // No draft survives: the workout tab carries no timer badge any more.
    await expect(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .locator('span[aria-hidden="true"]'),
    ).toHaveCount(0)
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

    // A rejection from the backend, not a network failure: an unreachable
    // network queues the save for later instead (see offline.spec.ts).
    await page.route('**/api.v1.WorkoutService/CreateWorkout', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )
    await finishAndSave(page)
    await expect(
      page.getByText('Workout could not be saved. Check your connection and try again.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Reopen' }).click()
    await expect(
      page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }),
    ).toHaveValue('25')
    await page.getByRole('button', { name: 'Complete exercise' }).click()

    await page.unroute('**/api.v1.WorkoutService/CreateWorkout')
    await finishAndSave(page)
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
    let weightEntry = unitFieldFor(page, `${exercise} set 1 weight`)
    await expect(weightEntry.locator('span')).toHaveText('kg')
    await expect(weightEntry.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('group', { name: /weight unit/ })).toHaveCount(0)

    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).fill('60')
    await page.getByLabel(`${exercise} set 1 reps`).fill('8')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await finishAndSave(page)
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
    weightEntry = unitFieldFor(page, `${exercise} set 1 weight`)
    await expect(weightEntry.locator('span')).toHaveText('lbs')

    // Heavier than anything seeded so this set becomes the exercise's personal
    // best and the records view has to render it back in the unit it was
    // entered in.
    await page
      .getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true })
      .fill('330.69')
    await page.getByLabel(`${exercise} set 1 reps`).fill('5')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await finishAndSave(page)

    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('status')).toContainText('Workout saved')
    await expect(page.getByText(/330\.69\s*lbs/)).toBeVisible()

    await page.goto('/progress')
    await expect(
      sectionWithHeading(page, 'Personal records').getByText(/330\.69\s*lbs/),
    ).toBeVisible()

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
    await expect(
      sectionWithHeading(page, 'Personal records').getByText(/330\.69\s*lbs/),
    ).toBeVisible()

    await page.goto('/workouts/quick')
    exercise = await addFirstExercise(page)
    weightEntry = unitFieldFor(page, `${exercise} set 1 weight`)
    await expect(weightEntry.locator('span')).toHaveText('kg')
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

  // A draft outlives the page: continuing in the background keeps it in local
  // storage, so the preference can change before the athlete returns to it.
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
    await page.getByRole('button', { name: 'Continue in the background' }).click()

    await page.goto('/profile')
    await page
      .getByRole('group', { name: 'Preferred weight unit' })
      .getByRole('button', { name: 'Pounds' })
      .click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')

    // 100 kg is the same weight as 220.46 lb. The row must never show the old
    // number beside the new unit, or finishing saves a weight nobody entered.
    await page.goto('/workouts/quick')
    await expect(unitFieldFor(page, `${exercise} set 1 weight`).locator('span')).toHaveText('lbs')
    await expect(
      page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }),
    ).toHaveValue('220.46')

    await page.getByRole('button', { name: 'Complete exercise' }).click()
    await finishAndSave(page)
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
    await expect(
      page
        .getByRole('group', { name: 'How do you track it?' })
        .getByRole('button', { name: /Distance/ }),
    ).toContainText('km')
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
      await pickerOptions(page, picker).first().click()

      // Distance is a decimal field carrying the preference as a static
      // suffix; time is a stopwatch-style field where bare digits fill in
      // from the right, so "1230" reads as 12:30.
      await expect(unitFieldFor(page, `${exerciseName} set 1 distance`).locator('span')).toHaveText(
        'mi',
      )
      await page
        .getByRole('textbox', { name: `${exerciseName} set 1 distance`, exact: true })
        .fill('3.5')
      const time = page.getByRole('textbox', { name: `${exerciseName} set 1 time`, exact: true })
      await time.fill('1230')
      await time.blur()
      await expect(time).toHaveValue('12:30')

      await page.getByRole('button', { name: 'Complete exercise' }).click()
      await finishAndSave(page)
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
      await pickerOptions(page, page.getByRole('dialog', { name: 'Choose a routine' }))
        .first()
        .click()
    }
    await page.getByRole('button', { name: 'Create plan' }).click()
    await expect(page.getByRole('heading', { name: planName })).toBeVisible()
    const planUrl = page.url()
    await page.getByRole('button', { name: 'Make active' }).click()
    await acceptConfirmDialog(page, 'Make active')
    await expect(page.getByText('Active plan', { exact: true })).toBeVisible()

    await page.goto('/workout')
    // The card that offers the next session is the one holding its start link.
    const nextCard = page
      .locator('section')
      .filter({ has: page.getByRole('link', { name: /^Start / }) })
    await expect(nextCard).toContainText('1 of 2')
    await nextCard.getByRole('link', { name: /^Start / }).click()

    const exercise = await openExerciseName(page)
    await logFirstSet(page, exercise, '30', '6')
    await page.getByRole('button', { name: 'Complete exercise' }).click()

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
    // The finish sheet always confirms — titled "early" only when exercises
    // remain unfinished.
    await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)

    await page.goto('/workout')
    await expect(nextCard).toContainText('2 of 2')

    await page.goto('/plans')
    await page.getByRole('button', { name: 'Pause' }).click()
    await acceptConfirmDialog(page, 'Pause')
    await expect(page.getByRole('heading', { name: 'No active plan' })).toBeVisible()
    await page.goto(planUrl)
    await page.getByRole('button', { name: 'Delete plan' }).click()
    await acceptConfirmDialog(page, 'Delete plan')
    await expect(page).toHaveURL(/\/plans$/)
  })

  test('loads previous workouts to a clear end state and opens a summary', async ({ page }) => {
    await page.goto('/workout')
    const history = sectionWithHeading(page, 'Previous workouts')
    await expect(history.getByRole('heading', { name: 'Previous workouts' })).toBeVisible()
    await expect(history.getByRole('link')).not.toHaveCount(0)
    await scrollToListEnd(page, page.getByText(/reached the end of your workout history/))
    await expect(history.getByRole('status')).toContainText('reached the end')

    const firstWorkoutName = (
      await history.getByRole('link').first().locator('strong').innerText()
    ).trim()
    await history.getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: firstWorkoutName, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '@alex', exact: true }).first()).toBeVisible()
    await expect(page.getByText('Completed workout', { exact: true })).toBeVisible()
  })
})
