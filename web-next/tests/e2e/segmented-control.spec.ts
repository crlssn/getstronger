import type { Page } from '@playwright/test'
import { expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

const email = process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'active@getstronger.test'
const password = process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? 'password123'

// The shared helper finds its fields by their English labels, which is exactly
// what this spec cannot rely on.
const logInWhateverTheLanguage = async (page: Page) => {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/home$/)
}

// The segmented control is auto-width and scrolls rather than dividing a row
// into equal columns, and the reason is entirely this: Föredragen viktenhet
// and Starta träningspass need somewhere to go. An equal-column grid gave the
// old weight-unit picker 69px for "Kilograms" and it clipped its own container.
const clippedOptions = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.segmented > *'))
      .filter((option) => option.scrollWidth > option.clientWidth + 1)
      .map((option) => `${option.textContent?.trim()} needs ${option.scrollWidth}px`),
  )

const pages = [
  { heading: /Föredragen viktenhet/, path: '/profile' },
  { heading: /Framsteg|Progress/, path: '/progress' },
  { heading: /Träning|Training/, path: '/routines' },
] as const

test.describe('in Swedish', () => {
  test.use({ locale: 'sv-SE' })

  test('never clips a segmented option @responsive', async ({ page }) => {
    await logInWhateverTheLanguage(page)

    for (const { heading, path } of pages) {
      await page.goto(path)
      await expect(page.getByText(heading).first()).toBeVisible()
      expect(await clippedOptions(page), `${path} clips a segmented option`).toEqual([])
    }
  })
})

test('keeps every segmented option above the tap-target floor', async ({ page }) => {
  await logIn(page)
  await page.goto('/profile')

  const options = page.locator('.segmented > *')
  await expect(options.first()).toBeVisible()

  for (const option of await options.all()) {
    const box = await option.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})
