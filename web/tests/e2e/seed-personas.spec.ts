import { expect, logInAs, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

test.describe('seed personas', () => {
  test('offers an empty new account and a socially active established account', async ({
    page,
  }) => {
    await logInAs(page, 'new@getstronger.test', 'password123')
    await expect(page.getByRole('heading', { name: 'Create your first routine' })).toBeVisible()
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Sam Taylor' })).toBeVisible()
    await expect(page.getByText('@sam · Edit profile', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Training summary')).toContainText('0workouts')

    await page.goto('/logout')
    await expect(page).toHaveURL(/\/login$/)

    await logInAs(page, 'active@getstronger.test', 'password123')
    await expect(page.getByRole('listitem').filter({ hasText: '@janedoe' }).first()).toBeVisible()
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible()
    await expect(page.getByLabel('Training summary')).not.toContainText('0workouts')
  })

  // Beta is reseeded on every deploy, so a feature with no seeded example
  // cannot be looked at there. Blocks and plans each need one.
  test('follows a plan and keeps a workout the blocks it was trained in', async ({ page }) => {
    await logInAs(page, 'active@getstronger.test', 'password123')

    await page.goto('/plans')
    await expect(page.getByRole('heading', { name: 'Weekly Rotation' })).toBeVisible()
    await expect(page.getByText('3 routines · repeat continuously')).toBeVisible()
    await expect(page.getByText('Routine 2 of 3')).toBeVisible()

    await page.goto('/profile')
    await page.getByRole('link', { name: 'View Full Body Circuit workout details' }).first().click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByText('Circuit · 3 rounds')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Round 3' })).toBeVisible()
  })
})
