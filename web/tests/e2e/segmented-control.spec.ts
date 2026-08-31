import type { Locator, Page } from '@playwright/test'
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

/**
 * Every option of every segmented control on the page.
 *
 * By role rather than by class: AppSegmented is a labelled group of buttons and
 * AppSegmentedNav a named navigation of links, and both of those are contracts
 * the component keeps. Its class names are module locals and appear hashed.
 */
const segmentedOptions = (page: Page, navName: RegExp): Locator[] => [
  page.getByRole('group').getByRole('button'),
  page.getByRole('navigation', { name: navName }).getByRole('link'),
]

const clipped = async (options: Locator) =>
  Promise.all(
    (await options.all()).map(async (option) => ({
      label: (await option.textContent())?.trim() ?? '',
      ...(await option.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))),
    })),
  ).then((measured) =>
    measured
      .filter((option) => option.scrollWidth > option.clientWidth + 1)
      .map((option) => `${option.label} needs ${option.scrollWidth}px`),
  )

// The segmented control is auto-width and scrolls rather than dividing a row
// into equal columns, and the reason is entirely this: Föredragen viktenhet
// and Starta träningspass need somewhere to go. An equal-column grid gave the
// old weight-unit picker 69px for "Kilograms" and it clipped its own container.
const pages = [
  { heading: /Föredragen viktenhet/, nav: /Träning|Training/, path: '/settings/units' },
  { heading: /Framsteg|Progress/, nav: /Träning|Training/, path: '/progress' },
  { heading: /Träning|Training/, nav: /Träning|Training/, path: '/routines' },
  // The two the audit caught: four presets whose longest label is Distans ×
  // tid, and the four profile tabs. Both are wider than 390px of screen, which
  // is the case the control scrolls for.
  { heading: /Hur mäter du övningen\?/, nav: /Träning|Training/, path: '/exercises/create' },
] as const

test.describe('in Swedish', () => {
  test.use({ locale: 'sv-SE' })

  test('never clips a segmented option @responsive', async ({ page }) => {
    await logInWhateverTheLanguage(page)

    for (const { heading, nav, path } of pages) {
      await page.goto(path)
      await expect(page.getByText(heading).first()).toBeVisible()

      for (const options of segmentedOptions(page, nav)) {
        expect(await clipped(options), `${path} clips a segmented option`).toEqual([])
      }
    }
  })
})

// The public profile's four tabs are the other row that has to survive 390px,
// and its path carries an id, so it is reached the way a reader reaches it.
test.describe('the public profile in Swedish', () => {
  test.use({ locale: 'sv-SE' })

  test('never clips one of its four tabs @responsive', async ({ page }) => {
    await logInWhateverTheLanguage(page)
    await page.goto('/profile')
    await page.getByRole('link', { name: /Offentlig profil/ }).click()
    await expect(page).toHaveURL(/\/users\//)

    const tabs = page.getByRole('navigation', { name: /Profilsektioner/ }).getByRole('link')
    await expect(tabs.first()).toBeVisible()

    expect(await clipped(tabs), 'the public profile clips a tab').toEqual([])
  })
})

test('keeps every segmented option above the tap-target floor', async ({ page }) => {
  await logIn(page)
  await page.goto('/settings/units')

  const options = page.getByRole('group').getByRole('button')
  await expect(options.first()).toBeVisible()

  for (const option of await options.all()) {
    const box = await option.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})
