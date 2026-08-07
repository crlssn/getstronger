import { expect, expectAccessible, logIn, test } from './fixtures'
import type { Page } from '@playwright/test'

const authenticatedPages = [
  { path: '/home', ready: /Good (morning|afternoon|evening)/ },
  { path: '/workout', ready: 'Workout' },
  { path: '/plans', ready: 'Training' },
  { path: '/exercises', ready: 'Exercises' },
  { path: '/profile', ready: 'John Doe' },
  { path: '/progress', ready: 'Progress you can read at a glance' },
] as const

const waitForPageData = async (page: Page, path: string) => {
  if (path === '/workout') {
    await expect(page.locator('.history-end, .history-empty, .history-error')).toBeVisible()
  }
}

test('keeps the primary authenticated pages accessible @responsive', async ({ page }) => {
  await logIn(page)

  for (const destination of authenticatedPages) {
    if (new URL(page.url()).pathname !== destination.path) await page.goto(destination.path)
    await expect(page.getByRole('heading', { name: destination.ready }).first()).toBeVisible()
    await waitForPageData(page, destination.path)
    await expectAccessible(page)
  }
})

test('keeps core layouts inside the viewport @responsive', async ({ page }) => {
  await logIn(page)

  for (const destination of authenticatedPages) {
    if (new URL(page.url()).pathname !== destination.path) await page.goto(destination.path)
    await expect(page.getByRole('heading', { name: destination.ready }).first()).toBeVisible()
    await waitForPageData(page, destination.path)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1)
  }
})

test('supports keyboard-only people search @smoke', async ({ page }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Search people' }).focus()
  await page.keyboard.press('Enter')

  const search = page.getByRole('searchbox', { name: 'Search people' })
  await expect(search).toBeFocused()
  await search.fill('Jane')
  const result = page.locator('.search-panel').getByRole('link', { name: /Jane Doe/ })
  await result.focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
  await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
})

test('renders the not-found state accessibly', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
  await expectAccessible(page)
})
