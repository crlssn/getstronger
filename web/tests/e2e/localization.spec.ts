import type { Page } from '@playwright/test'
import { expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

const email = process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'active@getstronger.test'
const password = process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? 'password123'

// The shared logIn helper finds its fields by their English labels, which a
// Swedish-locale browser no longer renders.
const logInInSwedish = async (page: Page) => {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/home$/)
}

// Issue #953: the Swedish locale used to fall back to English across core
// screens. Each assertion here covers a screen that showed mixed-language UI.
test.describe('in Swedish', () => {
  test.use({ locale: 'sv-SE' })

  test('renders the reviewed product surface in Swedish', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible()

    await logInInSwedish(page)

    // Home greets in Swedish.
    await expect(page.getByText(/God morgon|God eftermiddag|God kväll/).first()).toBeVisible()

    // Section headings come from the catalogue, via the router's title keys.
    for (const [path, heading] of [
      ['/workout', 'Träna'],
      ['/plans', 'Träning'],
      ['/exercises', 'Övningar'],
      ['/progress', 'Framsteg'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    }

    // Profile: unit preference labels.
    await page.goto('/profile')
    await expect(page.getByText('Föredragen viktenhet').first()).toBeVisible()

    // Notifications: the page title was hard-coded in the router and the feed
    // sentences were hard-coded in their components.
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Aviseringar' }).first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('followed you')
    await expect(page.locator('body')).not.toContainText('commented on')
  })
})

test('renders the same surface in English', async ({ page }) => {
  await logIn(page)

  for (const [path, heading] of [
    ['/workout', 'Workout'],
    ['/exercises', 'Exercises'],
    ['/notifications', 'Notifications'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  }

  await page.goto('/profile')
  await expect(page.getByText('Preferred weight unit').first()).toBeVisible()
})
