import { boxOf, expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

// The active workout screen is used mid-set, one-handed, with chalk on your
// hands. Its dominant control used to grey out until every set validated, so
// the screen's main action read as broken rather than as blocked. These are the
// two properties that fix costs: the primary stays live, and it says what is
// missing when it is pressed.
test.describe('the workout dock', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page)
    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    await page
      .getByRole('dialog', { name: 'Add exercise' })
      .locator('.exercise-options button')
      .first()
      .click()
  })

  test('keeps the primary action live while it is blocked', async ({ page }) => {
    const primary = page.locator('.primary-action')
    await expect(primary).toBeVisible()
    // Live and pressable. aria-disabled would announce to a screen reader the
    // same "broken" the grey fill used to say to everyone else.
    await expect(primary).toBeEnabled()
    expect(await primary.getAttribute('aria-disabled')).toBeNull()
  })

  // Completing works from wherever you are: a row nobody finished would never
  // have been saved, so it is dropped rather than kept as an obstacle.
  test('discards a half-typed row and completes the exercise anyway', async ({ page }) => {
    const exercise = await page.locator('.exercise-item.open .exercise-name').innerText()
    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).fill('25')

    await page.getByRole('button', { name: 'Complete exercise' }).click()

    await expect(page.locator('.completed-exercise')).toBeVisible()
    await expect(page.locator('.set-row')).toHaveCount(0)
  })

  test('says what is missing when the blocked primary is pressed', async ({ page }) => {
    // Only finishing can block now, so that is where the message lives.
    await page.locator('.primary-action').click()
    await page.locator('.primary-action').click()
    await expect(page.locator('.action-block > strong.blocked')).toHaveText(
      'Log at least one set to finish',
    )
    // The button points at the reason, so the two are announced together.
    await expect(page.locator('.primary-action')).toHaveAttribute(
      'aria-describedby',
      'workout-dock-status',
    )
  })

  test('clears the message once the block lifts', async ({ page }) => {
    await page.locator('.primary-action').click()
    await page.locator('.primary-action').click()
    await expect(page.locator('.action-block > strong.blocked')).toBeVisible()

    await page.getByRole('button', { name: 'Reopen' }).click()
    const exercise = await page.locator('.exercise-item.open .exercise-name').innerText()
    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).fill('25')
    await page.getByRole('textbox', { name: `${exercise} set 1 reps`, exact: true }).fill('8')

    await expect(page.locator('.action-block > strong.blocked')).toHaveCount(0)
    await expect(page.locator('.primary-action')).not.toHaveAttribute('aria-disabled', 'true')
  })

  test('ranks the dock: one filled primary, one text button', async ({ page }) => {
    const primary = page.locator('.primary-action')
    const secondary = page.locator('.finish-early')

    // 56px against 48px, and only one of them carries a fill.
    expect((await primary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56)
    const primaryFill = await primary.evaluate((node) => getComputedStyle(node).backgroundColor)
    const secondaryFill = await secondary.evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(primaryFill).not.toBe(secondaryFill)
    expect(secondaryFill).toBe('rgba(0, 0, 0, 0)')
  })

  test('gives every set input the full control height', async ({ page }) => {
    for (const input of await page.locator('.set-row input').all()) {
      expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48)
    }
  })

  // The row's spare width belongs to the fields being typed into, not to the
  // read-only previous column: no dead space in the middle of the row.
  test('lets the measurement inputs take the row’s spare width', async ({ page }) => {
    const row = page.locator('.set-row').first()
    const rowBox = await boxOf(row)
    const previousBox = await boxOf(row.locator('.previous-value'))

    const inputs = [row.locator('.unit-entry').first(), row.locator('input:not(.unit-entry input)')]
    for (const input of inputs) {
      expect((await boxOf(input)).width).toBeGreaterThanOrEqual(previousBox.width)
    }

    // The final column ends at the row's edge rather than leaving a gutter.
    const lastInput = await boxOf(row.locator('input:not(.unit-entry input)').last())
    expect(lastInput.x + lastInput.width).toBeGreaterThanOrEqual(rowBox.x + rowBox.width - 4)
  })
})
