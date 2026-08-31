import { allowRuntimeErrors, expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

// The profile is where a preference is found, and each one now lives on a
// screen of its own. What these pin is the whole path: the row on the profile
// says what the setting is set to, the screen behind it changes it, and the
// change survives a reload because it reached the account rather than the tab.
test.describe('settings', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  const settings = (page: Parameters<typeof logIn>[0]) =>
    page.getByRole('region', { name: 'Settings' })

  test('opens a setting from a row that says what it is set to @smoke', async ({ page }) => {
    await page.goto('/profile')

    const units = settings(page).getByRole('link', { name: /Units/ })
    await expect(units).toContainText('kg · km')

    await units.click()
    await expect(page).toHaveURL(/\/settings\/units$/)
    await expect(page.getByRole('heading', { name: 'Units' })).toBeVisible()
  })

  test('keeps a changed unit across a reload, and says so on the way back @mutation', async ({
    page,
  }) => {
    await page.goto('/settings/units')

    const unit = page.getByRole('group', { name: 'Preferred weight unit' })
    await unit.getByRole('button', { name: 'lbs', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')

    // Reloaded, so the value comes back from the account rather than from the
    // store the click left behind.
    await page.reload()
    await expect(unit.getByRole('button', { name: 'lbs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Units/ })).toContainText('lbs · km')
  })

  // A settings row has no save button, so a refused change has to put the
  // control back and say why where the tap happened.
  test('puts the control back and says why when the save fails', async ({ page }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    let refuse = true
    await page.route('**/api.v1.UserService/UpdateUserWeightUnit', async (route) => {
      if (!refuse) return route.continue()
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'internal', message: 'nope' }),
      })
    })

    await page.goto('/settings/units')
    const unit = page.getByRole('group', { name: 'Preferred weight unit' })
    await unit.getByRole('button', { name: 'lbs', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('Could not update weight unit')
    await expect(unit.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // The same tap again, with the backend answering, saves it.
    refuse = false
    await unit.getByRole('button', { name: 'lbs', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')
    await expect(unit.getByRole('button', { name: 'lbs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
