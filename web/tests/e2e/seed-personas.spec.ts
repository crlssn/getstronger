import { expect, logInAs, test } from './fixtures'

test.describe('seed personas', () => {
  test('offers an empty new account and a socially active established account', async ({ page }) => {
    await logInAs(page, 'new@onemorerep.test', 'password123')
    await expect(page.getByRole('heading', { name: 'Create your first routine' })).toBeVisible()
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Sam Taylor' })).toBeVisible()
    await expect(page.getByLabel('Training summary')).toContainText('0workouts')

    await page.goto('/logout')
    await expect(page).toHaveURL(/\/login$/)

    await logInAs(page, 'active@onemorerep.test', 'password123')
    await expect(page.locator('.feed-summary-card').filter({ hasText: 'Jane Doe' }).first()).toBeVisible()
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible()
    await expect(page.getByLabel('Training summary')).not.toContainText('0workouts')
  })
})
