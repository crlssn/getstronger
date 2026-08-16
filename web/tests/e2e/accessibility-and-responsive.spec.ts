import { expect, expectAccessible, logIn, resetSeedData, scrollToListEnd, test } from './fixtures'
import type { Page } from '@playwright/test'

test.beforeAll(resetSeedData)

const authenticatedPages = [
  { path: '/home', ready: /Good (morning|afternoon|evening)/ },
  { path: '/workout', ready: 'Workout' },
  { path: '/plans', ready: 'Training' },
  { path: '/exercises', ready: 'Exercises' },
  { path: '/profile', ready: 'Alex Morgan' },
  { path: '/progress', ready: 'Progress' },
] as const

const waitForPageData = async (page: Page, path: string) => {
  if (path === '/workout') {
    await scrollToListEnd(page, '.history-end, .history-empty, .history-error')
  }
}

const expectPrimaryNavigation = async (page: Page) =>
  expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()

test('keeps the primary authenticated pages accessible @responsive', async ({ page }) => {
  await logIn(page)

  for (const destination of authenticatedPages) {
    if (new URL(page.url()).pathname !== destination.path) await page.goto(destination.path)
    await expect(page.getByRole('heading', { name: destination.ready }).first()).toBeVisible()
    await waitForPageData(page, destination.path)
    await expectPrimaryNavigation(page)
    await expectAccessible(page)
  }
})

test('keeps core layouts inside the viewport @responsive', async ({ page }) => {
  await logIn(page)

  for (const destination of authenticatedPages) {
    if (new URL(page.url()).pathname !== destination.path) await page.goto(destination.path)
    await expect(page.getByRole('heading', { name: destination.ready }).first()).toBeVisible()
    await waitForPageData(page, destination.path)
    await expectPrimaryNavigation(page)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1)
  }
})

test('supports keyboard-only home search @smoke', async ({ page }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Search', exact: true }).focus()
  await page.keyboard.press('Enter')

  const search = page.getByRole('searchbox', {
    name: 'Search people, routines, plans, exercises',
    exact: true,
  })
  await expect(search).toBeFocused()
  await expect
    .poll(() =>
      search.evaluate((element) => getComputedStyle(element).getPropertyValue('--tw-ring-shadow')),
    )
    .toContain('calc(0px + 0px)')
  const searchField = page.locator('.search-field')
  await expect(searchField).toHaveCSS('border-top-style', 'solid')
  await expect
    .poll(() =>
      searchField.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--tw-ring-shadow'),
      ),
    )
    .toBe('0 0 #0000')
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
