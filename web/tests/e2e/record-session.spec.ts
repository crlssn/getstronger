import { allowRuntimeErrors, expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

// The recorder reads the browser's own fixes, so the suite grants location and
// then moves the athlete around a park in Stockholm.
test.use({
  geolocation: { latitude: 59.3326, longitude: 18.0649 },
  permissions: ['geolocation'],
})

const startLongitude = 18.0649
// A stride an accepted fix apart: roughly six metres a second at this
// latitude, which is a run rather than the jump the route measurement drops.
const strideDegrees = 0.0001
const strideMs = 1100
const strides = 6

const walkTheRoute = async (page: Parameters<typeof logIn>[0]) => {
  for (let step = 1; step <= strides; step += 1) {
    await page.waitForTimeout(strideMs)
    await page.context().setGeolocation({
      latitude: 59.3326,
      longitude: startLongitude + step * strideDegrees,
    })
  }
}

// The map's tiles come from the internet, which a test must not depend on.
// Withholding them is the offline case, and the route falls back to its bare
// shape — which is what these assertions read.
const withoutTiles = async (page: Parameters<typeof logIn>[0]) => {
  test.info().annotations.push(allowRuntimeErrors)
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
}

test.describe('a session with no set length', () => {
  test('records from the workout page and is named when it ends @mutation', async ({ page }) => {
    await withoutTiles(page)
    await logIn(page)
    await page.goto('/workout')

    await page.getByRole('link', { name: /Record a session/ }).click()
    await expect(page).toHaveURL(/\/record$/)
    await page.getByRole('button', { name: 'Start recording' }).click()

    // No countdown and no round: the clock counts up and says why.
    await expect(page.getByText('Active time')).toBeVisible()
    await expect(page.getByText('Runs until you end it')).toBeVisible()
    await expect(page.getByText(/Round/)).toHaveCount(0)
    await walkTheRoute(page)

    await page.getByRole('button', { name: 'End session' }).click()
    const sheet = page.getByRole('dialog', { name: 'What was this?' })
    await expect(sheet).toBeVisible()
    // The row carries a "Recent" label after the name, so the name is a prefix.
    await sheet.getByRole('button', { name: /^Run\b/ }).click()
    await sheet.getByRole('button', { name: 'Save as Run' }).click()

    // The saved workout is one interval of the exercise, with the route,
    // the distance and the time the recording measured.
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Run', exact: true })).toBeVisible()
    const route = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Workout route' }) })
    await expect(route.getByText('Active time', { exact: true })).toBeVisible()
    await expect(route.getByText('1 round')).toBeVisible()
    await expect(route.getByRole('list').nth(1).getByRole('listitem')).toHaveCount(1)
    await expect(route.getByText(/^0\.0\d\s*km$/).first()).toBeVisible()

    // And it reaches the feed the way every other workout does.
    await page.goto('/home')
    await expect(page.getByRole('link', { name: /Run.*workout details$/ }).first()).toBeVisible()
  })

  // A lead changed in settings has to reach the recorder, and it only ever
  // does so when the next session starts — which is what this pins.
  test('starts the recorder with the interval cue lead chosen in settings', async ({ page }) => {
    await withoutTiles(page)
    await logIn(page)

    await page.goto('/settings/interval-cue')
    await page.getByRole('button', { name: '20 seconds before the end' }).click()

    await page.goto('/record')
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByText('Active time')).toBeVisible()

    const saved = await page.evaluate(() => localStorage.getItem('getstronger:timed-circuit'))
    expect(JSON.parse(saved ?? '{}')).toMatchObject({ cueLeadSeconds: 20 })
  })

  test('records from an exercise and saves without asking @mutation', async ({ page }) => {
    await withoutTiles(page)
    await logIn(page)
    await page.goto('/exercises')
    await page
      .getByRole('link', { name: /^Run\b/ })
      .first()
      .click()

    // Starting a distance-and-time exercise means recording it.
    await page.getByRole('button', { name: /Record a session/ }).click()
    await expect(page).toHaveURL(/\/record\?exercise=[0-9a-f-]+$/)
    // The exercise came with it, so the screen is already named for it.
    await expect(page.getByRole('heading', { name: 'Run', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Start recording' }).click()
    await walkTheRoute(page)

    await page.getByRole('button', { name: 'End session' }).click()
    await expect(page.getByRole('dialog', { name: 'What was this?' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Run', exact: true })).toBeVisible()
  })
})
