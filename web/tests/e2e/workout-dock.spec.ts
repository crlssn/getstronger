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
      .getByRole('button')
      .filter({ has: page.locator('strong') })
      .first()
      .click()
  })

  const addAnotherExercise = async (page: Parameters<typeof logIn>[0]) => {
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    const option = picker
      .getByRole('button')
      .filter({ has: page.locator('strong') })
      .first()
    const name = (await option.locator('strong').innerText()).trim()
    await option.click()
    await expect(picker).toHaveCount(0)
    return name
  }

  // The form has one submit, and it is the screen's dominant control. The
  // escape hatch below it shares the "Finish workout" label, so the submit is
  // what tells them apart.
  const primaryAction = (page: Parameters<typeof logIn>[0]) => page.locator('button[type="submit"]')

  // The blocked message is what the primary points its aria-describedby at.
  const blockedMessage = (page: Parameters<typeof logIn>[0]) => page.locator('#workout-dock-status')

  const openExerciseName = async (page: Parameters<typeof logIn>[0]) =>
    (await page.getByRole('button', { expanded: true }).locator('strong').innerText()).trim()

  test('keeps the primary action live while it is blocked', async ({ page }) => {
    const primary = primaryAction(page)
    await expect(primary).toBeVisible()
    // Live and pressable. aria-disabled would announce to a screen reader the
    // same "broken" the grey fill used to say to everyone else.
    await expect(primary).toBeEnabled()
    expect(await primary.getAttribute('aria-disabled')).toBeNull()
  })

  // Completing works from wherever you are: a row nobody finished would never
  // have been saved, so it is dropped rather than kept as an obstacle.
  test('discards a half-typed row and completes the exercise anyway', async ({ page }) => {
    const exercise = await openExerciseName(page)
    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).fill('25')

    await page.getByRole('button', { name: 'Complete exercise' }).click()

    // Ticked off, with the way back offered: that is the completed panel.
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()
    // Each set row carries its own remove control, so counting them counts rows.
    await expect(page.getByRole('button', { name: /^Remove set/ })).toHaveCount(0)
  })

  test('says what is missing when the blocked primary is pressed', async ({ page }) => {
    // Only finishing can block now, so that is where the message lives.
    await primaryAction(page).click()
    await primaryAction(page).click()
    await expect(blockedMessage(page)).toHaveText('Log at least one set to finish')
    // The button points at the reason, so the two are announced together.
    await expect(primaryAction(page)).toHaveAttribute('aria-describedby', 'workout-dock-status')
  })

  test('clears the message once the block lifts', async ({ page }) => {
    await primaryAction(page).click()
    await primaryAction(page).click()
    await expect(blockedMessage(page)).toBeVisible()

    await page.getByRole('button', { name: 'Reopen' }).click()
    const exercise = await openExerciseName(page)
    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).fill('25')
    await page.getByRole('textbox', { name: `${exercise} set 1 reps`, exact: true }).fill('8')

    await expect(blockedMessage(page)).toHaveCount(0)
    await expect(primaryAction(page)).not.toHaveAttribute('aria-disabled', 'true')
  })

  // The label belongs to the exercise on screen; the destination is a hint.
  test('names what follows without renaming the action', async ({ page }) => {
    const primary = page.getByRole('button', { name: 'Complete exercise' })
    await expect(primary).toBeVisible()
    await expect(page.locator('#workout-next-up')).toHaveText('then: finish')

    const second = await addAnotherExercise(page)
    await expect(primary).toBeVisible()
    await expect(page.locator('#workout-next-up')).toHaveText(`then: ${second}`)
  })

  // Every exercise is one connected list, and the guided path is an offer
  // rather than a gate: any collapsed header opens on a tap.
  test('opens whichever exercise header is tapped', async ({ page }) => {
    await addAnotherExercise(page)

    // Each exercise's header is the control that expands it, so the headers
    // and their expanded state are the list.
    const headers = page.locator('button[aria-expanded]')
    const panels = page.locator('[id^="exercise-panel-"]')
    await expect(headers).toHaveCount(2)
    await expect(headers.nth(0)).toHaveAttribute('aria-expanded', 'true')

    await headers.nth(1).click()

    await expect(headers.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(headers.nth(0)).toHaveAttribute('aria-expanded', 'false')
    await expect(panels).toHaveCount(1)

    await headers.nth(0).click()
    await expect(headers.nth(0)).toHaveAttribute('aria-expanded', 'true')
    await expect(panels).toHaveCount(1)
  })

  test('ranks the dock: one filled primary, one text button', async ({ page }) => {
    const primary = primaryAction(page)
    // Nothing is complete yet, so the primary says "Complete exercise" and the
    // escape hatch is the only thing called "Finish workout".
    const secondary = page.getByRole('button', { name: 'Finish workout' })

    // 56px against 48px, and only one of them carries the ink fill. The way
    // out is outlined rather than text-only: as a ghost, its disabled state was
    // grey on grey with no border and read as a caption.
    expect((await primary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56)
    const primaryFill = await primary.evaluate((node) => getComputedStyle(node).backgroundColor)
    const secondaryFill = await secondary.evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(primaryFill).not.toBe(secondaryFill)

    const secondaryBorder = await secondary.evaluate((node) => {
      const style = getComputedStyle(node)
      return { colour: style.borderTopColor, width: style.borderTopWidth }
    })
    expect(parseFloat(secondaryBorder.width)).toBeGreaterThan(0)
    expect(secondaryBorder.colour).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('gives every set input the full control height', async ({ page }) => {
    for (const input of await page.getByRole('textbox', { name: /set \d+ / }).all()) {
      expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48)
    }
  })

  // The row is its own sideways scroller, so anything hanging off its edge is
  // clipped: the remove control used to land as a grey half-circle over the
  // corner of the field beside it.
  test('draws the remove control inside its row, under a fingertip', async ({ page }) => {
    const remove = page.getByRole('button', { name: 'Remove set 1' })
    const row = remove.locator('xpath=..')
    await row.hover()

    const rowBox = await boxOf(row)
    const removeBox = await boxOf(remove)

    expect(removeBox.x).toBeGreaterThanOrEqual(rowBox.x)
    expect(removeBox.y).toBeGreaterThanOrEqual(rowBox.y)
    expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    expect(removeBox.y + removeBox.height).toBeLessThanOrEqual(rowBox.y + rowBox.height)

    expect(removeBox.width).toBeGreaterThanOrEqual(44)
    expect(removeBox.height).toBeGreaterThanOrEqual(44)
  })

  // A phone has no hover, so the row being typed into is what reveals its
  // remove control. Until then the control takes no taps: it sits over the
  // corner of a field, and an invisible box there deletes a set silently.
  test('reveals the remove control when the row is typed into, not before', async ({ page }) => {
    await page.mouse.move(0, 0)
    const remove = page.getByRole('button', { name: 'Remove set 1' })
    const shown = () =>
      remove.evaluate((node) => {
        const style = getComputedStyle(node)
        return `${style.opacity} ${style.pointerEvents}`
      })

    expect(await shown()).toBe('0 none')

    const exercise = await openExerciseName(page)
    await page.getByRole('textbox', { name: `${exercise} set 1 weight`, exact: true }).focus()

    // Polled: the reveal is a fade, so the frame after focus is still on its
    // way to opaque.
    await expect.poll(shown).toBe('1 auto')
  })

  // The row's spare width belongs to the fields being typed into, not to the
  // read-only previous column: no dead space in the middle of the row.
  test('lets the measurement inputs take the row’s spare width', async ({ page }) => {
    // A grid of anonymous cells: reached through the one control in the row
    // that has a name, and then by shape. The set number and the previous value
    // are its two spans, the weight field its only div, the reps its only bare
    // input.
    const row = page.getByRole('button', { name: 'Remove set 1' }).locator('xpath=..')
    const rowBox = await boxOf(row)
    const previousBox = await boxOf(row.locator(':scope > span').nth(1))

    const inputs = [row.locator(':scope > div').first(), row.locator(':scope > input').first()]
    for (const input of inputs) {
      expect((await boxOf(input)).width).toBeGreaterThanOrEqual(previousBox.width)
    }

    // The final column ends at the row's edge rather than leaving a gutter.
    const lastInput = await boxOf(row.locator(':scope > input').last())
    expect(lastInput.x + lastInput.width).toBeGreaterThanOrEqual(rowBox.x + rowBox.width - 4)
  })
})
