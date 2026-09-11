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

// Half-way along, one fix the phone could not place: a hundred metres out and
// with an error circle to match, which a watch bridges and this app once
// dropped along with the two strides either side of it.
const vagueStride = 3

const walkTheRoute = async (page: Parameters<typeof logIn>[0]) => {
  for (let step = 1; step <= strides; step += 1) {
    await page.waitForTimeout(strideMs)
    await page
      .context()
      .setGeolocation(
        step === vagueStride
          ? { latitude: 59.3336, longitude: startLongitude, accuracy: 100 }
          : { latitude: 59.3326, longitude: startLongitude + step * strideDegrees },
      )
  }
}

// Standing at a crossing is not standing perfectly still: the fixes go on
// arriving and wander half a metre either side of the same spot, which is the
// drift the detector has to see through.
const driftDegrees = 0.0000045
const dwellMs = 500
const dwells = 18

const standStill = async (page: Parameters<typeof logIn>[0]) => {
  for (let step = 1; step <= dwells; step += 1) {
    await page.waitForTimeout(dwellMs)
    await page.context().setGeolocation({
      latitude: 59.3326 + (step % 2 ? driftDegrees : 0),
      longitude: startLongitude,
    })
  }
}

// A creep the detector will not let go of: under 2 km/h it reads as standing,
// and between the two speeds it leaves the hold where it is. The ground is the
// athlete's all the same, so a recorder that dropped these fixes would hand
// back a session that never covered it.
const creepDegrees = 0.0000079
const creepMs = 1000
const creeps = 20

// A real error circle rather than the perfect fixes the harness gives by
// default, so the route is smoothed the way a phone's is.
const fixAccuracy = 5

const creepOn = async (page: Parameters<typeof logIn>[0], from: number) => {
  for (let step = 1; step <= creeps; step += 1) {
    await page.waitForTimeout(creepMs)
    await page.context().setGeolocation({
      latitude: 59.3326,
      longitude: from + step * creepDegrees,
      accuracy: fixAccuracy,
    })
  }
}

/** The ground the recording screen says has been covered, in metres. */
const sessionMetres = async (page: Parameters<typeof logIn>[0]) => {
  const reading = await page.getByText('Distance', { exact: true }).locator('..').textContent()
  const shown = /([\d\s.,]+)\s*(k?m)$/.exec(reading?.trim() ?? '')
  if (!shown) throw new Error(`No distance in "${reading}"`)
  const figure = Number(shown[1].replace(/[^\d.]/g, ''))
  return shown[2] === 'km' ? figure * 1000 : figure
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
    // The session opens on the screen it is run on, with nothing to confirm.
    await expect(page.getByText('Active time')).toBeVisible()
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    // No countdown and no round: the clock counts up and says why.
    await expect(page.getByText('Active time')).toBeVisible()
    await expect(page.getByText('Runs until you end it')).toBeVisible()
    await expect(page.getByText(/Round/)).toHaveCount(0)

    // Neither rate is a number before the athlete has covered any ground: a
    // dash is honest where a figure divided out of the first fix is not.
    const paceNow = page.getByText('Pace now').locator('..')
    const speedNow = page.getByText('Speed', { exact: true }).locator('..')
    await expect(paceNow).toContainText('—')
    await expect(speedNow).toContainText('—')

    await walkTheRoute(page)
    // Past the floor both arrive together, per kilometre and per hour.
    await expect(paceNow).toContainText(/\d+:\d\d\s*\/km/)
    await expect(speedNow).toContainText(/[\d.]+\s*km\/h/)

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
    // Six strides of 5.7 m, the vague one bridged: 34 m, not the 23 m left
    // when the fixes either side of it are dropped.
    await expect(route.getByText(/^0\.03\s*km$/).first()).toBeVisible()

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
    await page.getByRole('button', { name: 'Start', exact: true }).click()
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
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await walkTheRoute(page)

    await page.getByRole('button', { name: 'End session' }).click()
    await expect(page.getByRole('dialog', { name: 'What was this?' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Run', exact: true })).toBeVisible()
  })

  // The detector can read a creep as a standstill, and once it holds it needs
  // 3 km/h to let go — so a slow enough stretch stays held for its whole
  // length. The clock is right to stop; the route is not, and metres the
  // recorder never wrote down are metres nothing can give back.
  test('keeps the ground it covers while it holds itself @mutation', async ({ page }) => {
    // Every wait below is a product threshold rather than padding: six strides
    // an accepted fix apart, a standstill longer than the two-second dwell, and
    // a creep slow enough to stay under 2 km/h for the five metres the
    // assertion needs. That is 36 seconds of scripted clock, which the file's
    // 45-second budget leaves nothing over.
    test.slow()
    await withoutTiles(page)
    await logIn(page)

    await page.goto('/profile')
    await page.getByRole('switch', { name: 'Pause while I stand still' }).click()
    await expect(page.getByRole('status')).toContainText('Auto-pause updated')

    await page.goto('/record')
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await walkTheRoute(page)
    await standStill(page)
    await expect(page.getByText('Auto-paused')).toBeVisible()

    // Creeping on from where the standstill left the athlete, too slowly for
    // the detector to let go: the hold stands through all of it.
    const held = await sessionMetres(page)
    await creepOn(page, startLongitude)
    await expect(page.getByText('Auto-paused')).toBeVisible()

    // The ground under the hold is on the clock that stopped, not lost with it.
    const crept = await sessionMetres(page)
    expect(crept).toBeGreaterThan(held + 5)

    // The switch is the account's, not the session's, and it outlives both:
    // put it back, or the next test toggles it off instead of on.
    await page.goto('/profile')
    await page.getByRole('switch', { name: 'Pause while I stand still' }).click()
    await expect(page.getByRole('status')).toContainText('Auto-pause updated')
  })

  test('holds itself at a standstill once the athlete asks it to @mutation', async ({ page }) => {
    await withoutTiles(page)
    await logIn(page)

    // The preference is the account's, so it travels from this switch through
    // the server to the recorder that reads it when the session starts.
    await page.goto('/profile')
    await page.getByRole('switch', { name: 'Pause while I stand still' }).click()
    await expect(page.getByRole('status')).toContainText('Auto-pause updated')

    await page.goto('/record')
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await walkTheRoute(page)
    await expect(page.getByText('Auto-paused')).toHaveCount(0)

    await standStill(page)
    await expect(page.getByText('Auto-paused')).toBeVisible()
    await expect(page.getByText(/^Paused for /)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()

    // And lets go on its own the moment the athlete moves off again.
    await walkTheRoute(page)
    await expect(page.getByText('Auto-paused')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

    await page.getByRole('button', { name: 'End session' }).click()
    const sheet = page.getByRole('dialog', { name: 'What was this?' })
    await sheet.getByRole('button', { name: /^Run\b/ }).click()
    await sheet.getByRole('button', { name: 'Save as Run' }).click()
    await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
  })
})
