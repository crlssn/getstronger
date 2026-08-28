import {
  acceptConfirmDialog,
  expect,
  expectAccessible,
  logIn,
  openExerciseActions,
  resetSeedData,
  test,
  uniqueName,
} from './fixtures'

test.beforeAll(resetSeedData)

// The library groups by when an exercise was last performed, most recent
// bucket first, so this is the order the headings must appear in.
const activityBucketLabels = [
  'Today',
  'Last week',
  'Last month',
  'Older than a month',
  'Not tried yet',
]

// The exercises a block holds, as its rows. The form's name field is a list
// item too, so the ordered list is what separates the exercises from it — and
// the rows carry no control of their own while the rest lengths are on show.
const routineExercises = (page: Parameters<typeof logIn>[0]) => page.locator('ol > li')

// A rest field is a textbox between two nudge buttons, and the buttons quote the
// field's own name so a screen reader can tell one row's from another's. That
// makes a label match find all three, so the textbox is asked for by role.
// A rest is a value between two nudge buttons rather than a field, and the
// buttons quote the value's own name so one row's can be told from another's.
const restValue = (page: Parameters<typeof logIn>[0], name: string) =>
  page.getByRole('spinbutton', { name, exact: true })

const stepRest = async (
  page: Parameters<typeof logIn>[0],
  name: string,
  by: 'Add' | 'Subtract',
  times = 1,
) => {
  const label = by === 'Add' ? `Add 30 seconds to ${name}` : `Subtract 30 seconds from ${name}`
  for (let step = 0; step < times; step += 1) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
}

// The rounds a circuit is prescribed for, nudged by the same kind of stepper as
// the rests beside it.
const stepRounds = async (page: Parameters<typeof logIn>[0], by: 'Add' | 'Subtract', times = 1) => {
  const label = by === 'Add' ? 'Add a round to Rounds' : 'Subtract a round from Rounds'
  for (let step = 0; step < times; step += 1) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
}

// The rest a routine gives an exercise reads as a chip on its row, and the
// chip is what unfolds the stepper.
const restChip = (page: Parameters<typeof logIn>[0], name: string, value: string) =>
  page.getByRole('button', { name: `Rest between sets of ${name}: ${value}`, exact: true })

const deleteExercise = async (page: Parameters<typeof logIn>[0], name: string) => {
  await page.goto('/exercises')
  await page.getByLabel('Search exercises').fill(name)
  const link = page.getByRole('link').filter({ hasText: name }).first()
  if (!(await link.isVisible())) return
  await link.click()
  await openExerciseActions(page)
  await page.getByRole('menuitem', { name: 'Delete exercise' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete exercise' }).click()
  await expect(page).toHaveURL(/\/exercises$/)
}

test.describe('exercise library', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('groups exercises by recent activity and searches names and tags', async ({ page }) => {
    await page.goto('/exercises')
    // allTextContents does not retry, so wait for the list before reading it.
    // Each activity group is a section headed by its bucket name.
    const groupHeadings = page.getByRole('heading', { level: 2 })
    await expect(groupHeadings.first()).toBeVisible()
    const groups = await groupHeadings.allTextContents()
    expect(groups).toEqual(activityBucketLabels.filter((label) => groups.includes(label)))

    // Every exercise in the library is a link to its own page; the create link
    // is one too, but it names nothing inside itself.
    const exerciseLinks = page
      .locator('a[href^="/exercises/"]')
      .filter({ has: page.locator('strong') })
    const firstExercise = exerciseLinks.first()
    const firstExerciseName = (await firstExercise.locator('strong').innerText()).trim()
    await page.getByLabel('Search exercises').fill(firstExerciseName.toLowerCase())
    const matches = exerciseLinks
    await expect(matches.first()).toBeVisible()
    await expect
      .poll(async () =>
        Promise.all(
          (await matches.all()).map(async (match) =>
            (await match.locator('strong').innerText()).trim().toLocaleLowerCase(),
          ),
        ),
      )
      .toEqual(
        Array.from({ length: await matches.count() }, () => firstExerciseName.toLocaleLowerCase()),
      )
    await expectAccessible(page)
  })

  test('reuses tag suggestions, rejects duplicates, and enforces the ten-tag limit @mutation', async ({
    page,
  }) => {
    const sourceName = uniqueName('Zz E2E tag source')
    const targetName = uniqueName('Aa E2E tag target')
    const sharedTag = uniqueName('E2E shared tag')

    try {
      await page.goto('/exercises/create')
      await page.locator('form input[type="text"]').first().fill(sourceName)
      await page.getByLabel('Add exercise tag').fill(sharedTag)
      await page.getByLabel('Add exercise tag').press('Enter')
      await page.getByRole('button', { name: 'Create exercise' }).click()
      await expect(page).toHaveURL(/\/exercises$/)

      await page.goto('/exercises/create')
      await page.locator('form input[type="text"]').first().fill(targetName)
      const tagInput = page.getByLabel('Add exercise tag')
      await tagInput.fill(sharedTag.slice(0, Math.max(3, sharedTag.length - 3)))
      await expect(page.getByRole('listbox', { name: 'Existing exercise tags' })).toBeVisible()
      await tagInput.press('ArrowDown')
      await tagInput.press('Enter')
      await expect(page.getByLabel('Exercise tags')).toContainText(sharedTag)

      await tagInput.fill(sharedTag.toUpperCase())
      await tagInput.press('Enter')
      await expect(page.getByText(/is already added/)).toBeVisible()

      for (let index = 1; index <= 9; index += 1) {
        await tagInput.fill(`E2E tag ${index}`)
        await tagInput.press('Enter')
      }
      await expect(page.getByLabel('Exercise tags').locator(':scope > button')).toHaveCount(10)
      await expect(page.getByLabel('Add exercise tag')).toHaveCount(0)

      await page.getByRole('button', { name: 'Create exercise' }).click()
      await page.getByLabel('Search exercises').fill(sharedTag)
      await expect(page.getByRole('link').filter({ hasText: sourceName })).toBeVisible()
      await expect(page.getByRole('link').filter({ hasText: targetName })).toBeVisible()
    } finally {
      await deleteExercise(page, targetName)
      await deleteExercise(page, sourceName)
    }
  })

  // A logged set is stored in the columns its exercise measured by at the time,
  // and nothing records which those were. Re-reading it under other
  // measurements would restate the training log rather than the exercise.
  test('settles the measurements of a logged exercise while its name stays editable @mutation', async ({
    page,
  }) => {
    const exerciseName = uniqueName('E2E Measurement lock')
    const renamedExercise = `${exerciseName} renamed`

    try {
      await page.goto('/exercises/create')
      await page.locator('form input[type="text"]').first().fill(exerciseName)
      await page.getByRole('button', { name: 'Create exercise' }).click()
      await expect(page).toHaveURL(/\/exercises$/)

      const openForEditing = async (name: string) => {
        await page.goto('/exercises')
        await page.getByLabel('Search exercises').fill(name)
        await page.getByRole('link').filter({ hasText: name }).first().click()
        await openExerciseActions(page)
        await page.getByRole('menuitem', { name: 'Edit exercise' }).click()
        await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+\/edit$/)
      }

      // Nothing logged yet, so a mistake made at creation time is correctable.
      await openForEditing(exerciseName)
      await expect(page.getByRole('group', { name: 'How do you track it?' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Distance × time' })).toBeVisible()

      await page.goto('/workouts/quick')
      await page.getByRole('button', { name: 'Choose exercise' }).click()
      const picker = page.getByRole('dialog', { name: 'Add exercise' })
      await picker.getByLabel('Search exercises').fill(exerciseName)
      await picker
        .getByRole('button')
        .filter({ has: page.locator('strong') })
        .first()
        .click()
      await page
        .getByRole('textbox', { name: `${exerciseName} set 1 weight`, exact: true })
        .fill('100')
      await page.getByRole('textbox', { name: `${exerciseName} set 1 reps`, exact: true }).fill('5')
      await page.getByRole('button', { name: 'Complete exercise' }).click()
      await page.getByRole('button', { name: 'Finish workout' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
      await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)

      // With a set behind it the block is read back rather than offered, and
      // says why.
      await openForEditing(exerciseName)
      await expect(page.getByRole('list', { name: 'How do you track it?' })).toBeVisible()
      await expect(page.getByRole('group', { name: 'How do you track it?' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Distance × time' })).toHaveCount(0)
      await expect(
        page.getByText('Measurements stay as they are once sets are logged'),
      ).toBeVisible()
      await expectAccessible(page)

      // The name is not a unit of the recorded history, so it still saves.
      await page.locator('form input[type="text"]').first().fill(renamedExercise)
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/)
      await expect(page.getByText('Exercise updated')).toBeVisible()

      // And the set is still the lift it was logged as.
      await expect(page.getByRole('heading', { name: 'Logged sets' })).toBeVisible()
      await expect(page.getByText(/100\s*(kg|lbs)\s*·\s*5/)).toBeVisible()
    } finally {
      await deleteExercise(page, renamedExercise)
      await deleteExercise(page, exerciseName)
    }
  })

  test('deletes an exercise through the header menu while preserving workout history @mutation', async ({
    page,
  }) => {
    const exerciseName = uniqueName('E2E Deletion target')

    // Create the exercise and log it once so there is history to preserve.
    await page.goto('/exercises/create')
    await page.locator('form input[type="text"]').first().fill(exerciseName)
    await page.getByRole('button', { name: 'Create exercise' }).click()
    await expect(page).toHaveURL(/\/exercises$/)

    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    await picker.getByLabel('Search exercises').fill(exerciseName)
    await picker
      .getByRole('button')
      .filter({ has: page.locator('strong') })
      .first()
      .click()
    await page
      .getByRole('textbox', { name: `${exerciseName} set 1 weight`, exact: true })
      .fill('40')
    await page.getByRole('textbox', { name: `${exerciseName} set 1 reps`, exact: true }).fill('5')
    await page.getByRole('button', { name: 'Complete exercise' }).click()
    // Finishing always pauses on the confirmation sheet that carries the note.
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    const workoutURL = page.url()

    // The exercise page leads with history; management sits in the header menu.
    await page.goto('/exercises')
    await page.getByLabel('Search exercises').fill(exerciseName)
    await page.getByRole('link').filter({ hasText: exerciseName }).first().click()
    await expect(page.getByRole('heading', { name: 'Logged sets' })).toBeVisible()

    // The confirmation explains what deleting does before anything happens.
    await openExerciseActions(page)
    await page.getByRole('menuitem', { name: 'Delete exercise' }).click()
    // The menu fades out as the sheet opens, and a contrast check that catches
    // it mid-fade measures the transition rather than the design.
    await expect(page.getByRole('menu')).toHaveCount(0)
    const dialog = page.getByRole('dialog', { name: `Delete “${exerciseName}”?` })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(
      'The exercise is removed from your library and from every routine that includes it.',
    )
    await expect(dialog).toContainText(
      'Sets you have already logged are kept in your workout history.',
    )
    await expectAccessible(page)

    // Escape backs out from the keyboard, the cancel button by pointer, and
    // neither deletes anything.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await openExerciseActions(page)
    await page.getByRole('menuitem', { name: 'Delete exercise' }).click()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Logged sets' })).toBeVisible()

    // Confirming deletes, reports success, and removes it from the library.
    await openExerciseActions(page)
    await page.getByRole('menuitem', { name: 'Delete exercise' }).click()
    await dialog.getByRole('button', { name: 'Delete exercise' }).click()
    await expect(page).toHaveURL(/\/exercises$/)
    await expect(page.getByText('Exercise deleted')).toBeVisible()
    await page.getByLabel('Search exercises').fill(exerciseName)
    await expect(page.getByText('No matching exercises')).toBeVisible()

    // The finished workout keeps the deleted exercise and its logged set.
    await page.goto(workoutURL)
    await expect(page.getByText(exerciseName, { exact: true })).toBeVisible()
    const setsTable = page.getByRole('table', { name: `${exerciseName} sets` })
    await expect(setsTable.getByRole('row', { name: /Set 1.*40\s*(kg|lbs)\s*5/ })).toBeVisible()
  })
})

// Exercises are picked into the block that trains them, through the sheet the
// session uses. `groupIndex` names which block's button to press.
const addRoutineExercise = async (
  page: Parameters<typeof logIn>[0],
  name?: string,
  groupIndex = 0,
) => {
  await page.getByRole('button', { name: 'Add exercise' }).nth(groupIndex).click()
  const sheet = page.getByRole('dialog')

  if (name) await sheet.getByLabel('Search exercises').fill(name)
  const option = name
    ? sheet.getByRole('button').filter({ hasText: name })
    : sheet.getByRole('button').filter({ has: page.locator('strong') })

  const chosen = option.first()
  const chosenName = (await chosen.locator('strong').innerText()).trim()
  await chosen.click()
  await expect(sheet).toBeHidden()

  return chosenName
}

test.describe('routine lifecycle', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('creates, searches, updates, selects as up next, and deletes a routine @mutation', async ({
    page,
  }) => {
    const routineName = uniqueName('E2E Routine')
    const updatedName = `${routineName} Updated`

    await page.goto('/routines/create')
    const saveButton = page.getByRole('button', { name: 'Create routine' })
    await expect(saveButton).toBeDisabled()
    await page.getByLabel('Routine name').fill(routineName)
    await addRoutineExercise(page)
    await addRoutineExercise(page)
    await expect(routineExercises(page)).toHaveCount(2)
    await saveButton.click()

    await expect(page).toHaveURL(/\/routines$/)
    await page.getByLabel('Search routines').fill(routineName)
    await expect(page.getByRole('heading', { name: routineName })).toBeVisible()
    await page.getByRole('heading', { name: routineName }).click()

    await expect(page.getByRole('heading', { name: 'Exercise order' })).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(2)
    await page.getByRole('link', { name: 'Edit exercises' }).click()
    await page.getByLabel('Routine name').fill(updatedName)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible()
    await page.getByRole('button', { name: 'Make up next' }).click()
    await expect(page.getByRole('status')).toContainText(`${updatedName} is up next`)

    await page.getByRole('button', { name: 'Delete' }).click()
    await acceptConfirmDialog(page, 'Delete')
    await expect(page).toHaveURL(/\/routines$/)
    await expect(page.getByRole('status')).toContainText('Routine deleted')
  })

  // Reordering is a drag: the row carries a handle, and where it is dropped is
  // the order the routine is saved and read back in.
  test('drags an exercise into a new place and saves the order @mutation', async ({ page }) => {
    const routineName = uniqueName('E2E Drag')

    try {
      await page.goto('/routines/create')
      await page.getByLabel('Routine name').fill(routineName)
      const first = await addRoutineExercise(page)
      const second = await addRoutineExercise(page)

      const rows = routineExercises(page)
      await expect(rows.first()).toContainText(first)

      await page
        .getByRole('button', { name: `Reorder ${second}`, exact: true })
        .dragTo(page.getByRole('button', { name: `Reorder ${first}`, exact: true }))
      await expect(rows.first()).toContainText(second)

      await page.getByRole('button', { name: 'Create routine' }).click()
      await expect(page).toHaveURL(/\/routines$/)

      // Read back from the API rather than from the form that dragged it.
      await page.getByLabel('Search routines').fill(routineName)
      await page.getByRole('heading', { name: routineName }).click()
      await expect(page.getByRole('listitem').first()).toContainText(second)
    } finally {
      await page.goto('/routines')
      await page.getByLabel('Search routines').fill(routineName)
      const saved = page.getByRole('heading', { name: routineName })
      if (await saved.isVisible()) {
        await saved.click()
        await page.getByRole('button', { name: 'Delete' }).click()
        await acceptConfirmDialog(page, 'Delete')
      }
    }
  })

  // The form's chrome: a save that a long routine cannot scroll away from, and
  // one way out — the nav bar's back row, which is the only one now that the
  // form's own "Cancel" is gone from the slot right beside it.
  test('keeps the save pinned and leaves by the back row @mutation', async ({ page }) => {
    await page.goto('/routines/create')
    await page.getByLabel('Routine name').fill(uniqueName('E2E Pinned'))
    for (let added = 0; added < 4; added += 1) await addRoutineExercise(page)

    // Still in the viewport with the form scrolled to the top, which is where
    // the old save — parked under the last exercise — was not.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.getByRole('button', { name: 'Create routine' })).toBeInViewport()

    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Training' }).click()
    await expect(page).toHaveURL(/\/routines$/)
  })

  // The whole circuit, end to end: built in groups and prescribed for a number
  // of rounds, saved, read back, and then trained one set at a time until the
  // last round walks the block out.
  //
  // It brings its own exercises rather than borrowing seeded ones: a saved
  // workout becomes the previous session for whatever it was logged against,
  // and that is what later tests autofill from.
  test('builds a circuit and trains it a round at a time @mutation', async ({ page }) => {
    const routineName = uniqueName('E2E Circuit')
    const first = uniqueName('E2E Circuit press')
    const second = uniqueName('E2E Circuit squat')

    try {
      for (const exercise of [first, second]) {
        await page.goto('/exercises/create')
        await page.locator('form input[type="text"]').first().fill(exercise)
        await page.getByRole('button', { name: 'Create exercise' }).click()
        await expect(page).toHaveURL(/\/exercises$/)
      }

      await page.goto('/routines/create')
      await page.getByLabel('Routine name').fill(routineName)
      await addRoutineExercise(page, first)
      await addRoutineExercise(page, second)
      await expect(routineExercises(page)).toHaveCount(2)

      // Grouping is the advanced half of the form; a circuit lives inside it.
      await page.getByRole('button', { name: 'Advanced', exact: true }).click()
      await page.getByRole('button', { name: 'Circuit', exact: true }).click()
      await stepRest(page, 'Rest after each exercise in group A', 'Subtract', 2)
      await stepRest(page, 'Rest after each round in group A', 'Add')
      // A new circuit arrives prescribed for three rounds; two is enough here.
      await expect(page.getByRole('spinbutton', { name: 'Rounds in group A' })).toHaveText('3')
      await stepRounds(page, 'Subtract')
      await page.getByRole('button', { name: 'Create routine' }).click()

      await expect(page).toHaveURL(/\/routines$/)
      await page.getByLabel('Search routines').fill(routineName)
      await page.getByRole('heading', { name: routineName }).click()

      // Saved, read back from the API, and described in the words it was built
      // with — the prescription included.
      await expect(page.getByText('Circuit · 2 rounds', { exact: true })).toBeVisible()
      await expect(
        page.getByText('Rest 30s between exercises · Rest 120s between rounds'),
      ).toBeVisible()

      // Reopened for editing, the builder shows the circuit as a circuit rather
      // than as the plain block a routine starts as, and a change to it is
      // saved as one.
      await page.getByRole('link', { name: 'Edit exercises' }).click()
      await expect(page.getByRole('button', { name: 'Advanced', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByRole('button', { name: 'Circuit', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByRole('spinbutton', { name: 'Rounds in group A' })).toHaveText('2')
      await expect(routineExercises(page)).toHaveCount(2)

      await stepRest(page, 'Rest after each round in group A', 'Subtract', 3)
      await page.getByRole('button', { name: 'Save changes' }).click()

      await expect(
        page.getByText('Rest 30s between exercises · Rest 30s between rounds'),
      ).toBeVisible()

      await page.getByRole('link', { name: 'Start workout' }).click()
      await expect(page.getByText('Round 1 of 2 · exercise 1 of 2')).toBeVisible()

      const complete = page.locator('button[type="submit"]')
      await expect(complete).toHaveText('Complete set')

      // A row per round: the block is laid out in front of you, because the
      // routine says how many times round it goes.
      await expect(
        page.getByRole('textbox', { name: `${first} set 2 weight`, exact: true }),
      ).toBeVisible()

      await page.getByRole('textbox', { name: `${first} set 1 weight`, exact: true }).fill('25')
      await page.getByRole('textbox', { name: `${first} set 1 reps`, exact: true }).fill('8')
      // A circuit rests on the way to the next station, not the moment the set
      // is complete.
      await expect(page.getByRole('region', { name: 'Rest timer' })).toHaveCount(0)

      await complete.click()
      await expect(page.getByText('Round 1 of 2 · exercise 2 of 2')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()

      await page.getByRole('textbox', { name: `${second} set 1 weight`, exact: true }).fill('30')
      await page.getByRole('textbox', { name: `${second} set 1 reps`, exact: true }).fill('6')
      await complete.click()

      // The round only turns over once every exercise in it has taken its set.
      await expect(page.getByText('Round 2 of 2 · exercise 1 of 2')).toBeVisible()

      await page.getByRole('textbox', { name: `${first} set 2 weight`, exact: true }).fill('25')
      await page.getByRole('textbox', { name: `${first} set 2 reps`, exact: true }).fill('8')
      await complete.click()

      // The last set of the last round is the end of the block, so the button
      // that logs it says so — and pressing it ticks off every exercise at once.
      await page.getByRole('textbox', { name: `${second} set 2 weight`, exact: true }).fill('30')
      await page.getByRole('textbox', { name: `${second} set 2 reps`, exact: true }).fill('6')
      await expect(complete).toHaveText('Complete circuit')

      await complete.click()
      await expect(page.getByRole('button', { name: 'Complete circuit' })).toHaveCount(0)
      await expect(complete).toHaveText('Finish workout')

      await page.getByRole('button', { name: 'Finish workout' }).first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
      await expect(page).toHaveURL(/\/workouts\//)

      // The saved workout reads as the block it was trained in, round by round,
      // rather than as two unrelated exercises each with its sets.
      await expect(page.getByText('Circuit · 2 rounds')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible()
      await expect(page.getByText('25 kg · 8').first()).toBeVisible()
      await expect(page.getByText('30 kg · 6').first()).toBeVisible()

      await page.getByRole('button', { name: 'Workout actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete workout' }).click()
      await acceptConfirmDialog(page, 'Delete workout')
      await expect(page.getByRole('status')).toContainText('Workout deleted')
    } finally {
      await page.goto('/routines')
      await page.getByLabel('Search routines').fill(routineName)
      const savedRoutine = page.getByRole('heading', { name: routineName })
      if (await savedRoutine.isVisible()) {
        await savedRoutine.click()
        await page.getByRole('button', { name: 'Delete' }).click()
        await acceptConfirmDialog(page, 'Delete')
        await expect(page.getByRole('status')).toContainText('Routine deleted')
      }
      await deleteExercise(page, second)
      await deleteExercise(page, first)
    }
  })

  // Both rests belong to the routine: how long a lift rests between its sets,
  // and how long the block pauses on the way to the next lift. Built, saved,
  // read back, and then trained with both lengths on the clock.
  test('rests for the lengths the routine gives an exercise @mutation', async ({ page }) => {
    const routineName = uniqueName('E2E Rest')
    const lift = uniqueName('E2E Rest press')
    const second = uniqueName('E2E Rest row')

    try {
      for (const name of [lift, second]) {
        await page.goto('/exercises/create')
        await page.locator('form input[type="text"]').first().fill(name)
        await page.getByRole('button', { name: 'Create exercise' }).click()
        await expect(page).toHaveURL(/\/exercises$/)
      }

      await page.goto('/routines/create')
      await page.getByLabel('Routine name').fill(routineName)
      await addRoutineExercise(page, lift)
      await addRoutineExercise(page, second)

      // Read off a clock, and a real value from the moment it is picked rather
      // than a placeholder for a length written down somewhere else. The
      // stepper is folded away behind the chip until somebody tunes it.
      await restChip(page, lift, '1:30').click()
      await stepRest(page, `Rest between sets of ${lift}`, 'Add', 7)
      await expect(restValue(page, `Rest between sets of ${lift}`)).toHaveText('5:00')

      // A plain routine says how long it pauses between exercises too, without
      // having to be turned into a circuit first.
      const between = restValue(page, 'Rest after each exercise')
      await expect(between).toHaveText('1:30')
      await stepRest(page, 'Rest after each exercise', 'Add')
      await expect(between).toHaveText('2:00')

      await page.getByRole('button', { name: 'Create routine' }).click()

      await expect(page).toHaveURL(/\/routines$/)
      await page.getByLabel('Search routines').fill(routineName)
      await page.getByRole('heading', { name: routineName }).click()

      // Saved and read back from the API: reopening the builder shows the
      // routine's own answers rather than a default.
      await page.getByRole('link', { name: 'Edit exercises' }).click()
      await expect(restChip(page, lift, '5:00')).toBeVisible()
      await expect(restValue(page, 'Rest after each exercise')).toHaveText('2:00')
      await page.getByRole('button', { name: 'Save changes' }).click()

      await page.getByRole('link', { name: 'Start workout' }).click()
      await page.getByRole('textbox', { name: `${lift} set 1 weight`, exact: true }).fill('40')
      await page.getByRole('textbox', { name: `${lift} set 1 reps`, exact: true }).fill('10')

      // Five minutes, not the ninety seconds it started at.
      const restTimer = page.getByRole('region', { name: 'Rest timer' })
      await expect(restTimer).toContainText(/0[45]:\d\d/)

      // Moving on rests for the block's length instead, which is the pause
      // between one exercise and the next rather than between two sets.
      await page.getByRole('button', { name: 'Complete exercise' }).first().click()
      await expect(restTimer).toContainText(/0[12]:\d\d/)

      await page.getByRole('button', { name: 'Finish workout' }).first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
      await expect(page).toHaveURL(/\/workouts\//)

      await page.getByRole('button', { name: 'Workout actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete workout' }).click()
      await acceptConfirmDialog(page, 'Delete workout')
      await expect(page.getByRole('status')).toContainText('Workout deleted')
    } finally {
      await page.goto('/routines')
      await page.getByLabel('Search routines').fill(routineName)
      const savedRoutine = page.getByRole('heading', { name: routineName })
      if (await savedRoutine.isVisible()) {
        await savedRoutine.click()
        await page.getByRole('button', { name: 'Delete' }).click()
        await acceptConfirmDialog(page, 'Delete')
        await expect(page.getByRole('status')).toContainText('Routine deleted')
      }
      await deleteExercise(page, second)
      await deleteExercise(page, lift)
    }
  })
})

test.describe('plan lifecycle', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('builds an ordered loop, activates, pauses, updates, and deletes it @mutation', async ({
    page,
  }) => {
    const planName = uniqueName('E2E Plan')
    const updatedPlanName = `${planName} Updated`

    await page.goto('/plans/create')
    await page.getByLabel('Plan name').fill(planName)
    await page.getByRole('button', { name: 'Add routine' }).click()
    let picker = page.getByRole('dialog', { name: 'Choose a routine' })
    const firstOption = picker.getByRole('button').filter({ has: page.locator('strong') })
    const firstRoutineName = (await firstOption.first().locator('strong').innerText()).trim()
    await firstOption.first().click()

    await page.getByRole('button', { name: 'Add routine' }).click()
    picker = page.getByRole('dialog', { name: 'Choose a routine' })
    const secondOption = picker.getByRole('button').filter({ has: page.locator('strong') })
    const secondRoutineName = (await secondOption.first().locator('strong').innerText()).trim()
    await secondOption.first().click()

    // The plan's order is the only list on the builder.
    const order = page.getByRole('listitem')
    await expect(order).toHaveCount(2)
    await order
      .nth(1)
      .getByRole('button', { name: /Move .* up/ })
      .click()
    await page.getByRole('button', { name: 'Create plan' }).click()

    await expect(page.getByRole('heading', { name: planName })).toBeVisible()
    const viewOrder = page.getByRole('listitem')
    await expect(viewOrder.first()).toContainText(secondRoutineName)
    await expect(viewOrder.nth(1)).toContainText(firstRoutineName)

    await page.getByRole('button', { name: 'Make active' }).click()
    await acceptConfirmDialog(page, 'Make active')
    await expect(page.getByText('Active plan', { exact: true })).toBeVisible()
    await expect(page.getByRole('listitem').first()).toContainText('UP NEXT')

    await page.goto('/plans')
    const activePlanCard = page
      .locator('section')
      .filter({ has: page.getByText('Active plan', { exact: true }) })
    await expect(activePlanCard).toContainText(planName)
    await expect(activePlanCard).toContainText(secondRoutineName)
    await page.getByRole('button', { name: 'Pause' }).click()
    await acceptConfirmDialog(page, 'Pause')
    await expect(page.getByRole('heading', { name: 'No active plan' })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(planName) }).click()
    await page.getByRole('link', { name: 'Edit plan' }).click()
    await page.getByLabel('Plan name').fill(updatedPlanName)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: updatedPlanName })).toBeVisible()

    await page.getByRole('button', { name: 'Delete plan' }).click()
    await acceptConfirmDialog(page, 'Delete plan')
    await expect(page).toHaveURL(/\/plans$/)
    await expect(page.getByText(updatedPlanName)).toHaveCount(0)
  })
})
