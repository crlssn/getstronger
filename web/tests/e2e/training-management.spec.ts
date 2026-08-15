import { expect, expectAccessible, logIn, resetSeedData, test, uniqueName } from './fixtures'

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

const deleteExercise = async (page: Parameters<typeof logIn>[0], name: string) => {
  await page.goto('/exercises')
  await page.getByLabel('Search exercises').fill(name)
  const link = page.getByRole('link').filter({ hasText: name }).first()
  if (!(await link.isVisible())) return
  await link.click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete exercise' }).click()
  await expect(page).toHaveURL(/\/exercises$/)
}

test.describe('exercise library', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('groups exercises by recent activity and searches names and tags', async ({ page }) => {
    await page.goto('/exercises')
    // allTextContents does not retry, so wait for the list before reading it.
    await expect(page.locator('.exercise-group').first()).toBeVisible()
    const groups = await page.locator('.exercise-group > h2').allTextContents()
    expect(groups).toEqual(activityBucketLabels.filter((label) => groups.includes(label)))

    const firstExercise = page.locator('.exercise-group-card a').first()
    const firstExerciseName = (await firstExercise.locator('strong').innerText()).trim()
    await page.getByLabel('Search exercises').fill(firstExerciseName.toLowerCase())
    const matches = page.locator('.exercise-group-card a')
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
      await page.getByRole('button', { name: 'Save Exercise' }).click()
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
      await expect(page.getByLabel('Exercise tags').locator(':scope > span')).toHaveCount(10)
      await expect(page.getByLabel('Add exercise tag')).toHaveCount(0)

      await page.getByRole('button', { name: 'Save Exercise' }).click()
      await page.getByLabel('Search exercises').fill(sharedTag)
      await expect(page.getByRole('link').filter({ hasText: sourceName })).toBeVisible()
      await expect(page.getByRole('link').filter({ hasText: targetName })).toBeVisible()
    } finally {
      await deleteExercise(page, targetName)
      await deleteExercise(page, sourceName)
    }
  })
})

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
    await page.locator('.exercise-option').first().click()
    await page.locator('.exercise-option').nth(1).click()
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
    await saveButton.click()

    await expect(page).toHaveURL(/\/routines$/)
    await page.getByLabel('Search routines').fill(routineName)
    await expect(page.getByRole('heading', { name: routineName })).toBeVisible()
    await page.getByRole('heading', { name: routineName }).click()

    await expect(page.getByRole('heading', { name: 'Exercise order' })).toBeVisible()
    await expect(page.locator('.exercise-list li')).toHaveCount(2)
    await page.getByRole('link', { name: 'Edit exercises' }).click()
    await page.getByLabel('Routine name').fill(updatedName)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible()
    await page.getByRole('button', { name: 'Make up next' }).click()
    await expect(page.getByRole('status')).toContainText(`${updatedName} is up next`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/routines$/)
    await expect(page.getByRole('alert')).toContainText('Routine deleted')
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
    const firstRoutineName = (
      await picker.locator('.routine-options button strong').first().innerText()
    ).trim()
    await picker.locator('.routine-options button').first().click()

    await page.getByRole('button', { name: 'Add routine' }).click()
    picker = page.getByRole('dialog', { name: 'Choose a routine' })
    const secondRoutineName = (
      await picker.locator('.routine-options button strong').first().innerText()
    ).trim()
    await picker.locator('.routine-options button').first().click()

    const order = page.locator('.routine-order ol li')
    await expect(order).toHaveCount(2)
    await order
      .nth(1)
      .getByRole('button', { name: /Move .* up/ })
      .click()
    await page.getByRole('button', { name: 'Create plan' }).click()

    await expect(page.getByRole('heading', { name: planName })).toBeVisible()
    await expect(page.locator('.routine-order li').first()).toContainText(secondRoutineName)
    await expect(page.locator('.routine-order li').nth(1)).toContainText(firstRoutineName)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Make active' }).click()
    await expect(page.getByText('Active plan', { exact: true })).toBeVisible()
    await expect(page.locator('.routine-order li').first()).toContainText('UP NEXT')

    await page.goto('/plans')
    await expect(page.locator('.active-plan')).toContainText(planName)
    await expect(page.locator('.active-plan')).toContainText(secondRoutineName)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('heading', { name: 'No active plan' })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(planName) }).click()
    await page.getByRole('link', { name: 'Edit plan' }).click()
    await page.getByLabel('Plan name').fill(updatedPlanName)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: updatedPlanName })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete plan' }).click()
    await expect(page).toHaveURL(/\/plans$/)
    await expect(page.getByText(updatedPlanName)).toHaveCount(0)
  })
})
