import { allowRuntimeErrors, expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

// Cold serverless starts and gym basements both take the backend away. These
// journeys pin the offline contract: reads fall back to the cached last page,
// the user is told they are offline, and a workout finished without internet
// is queued and synced once connectivity returns.
test.describe('offline mode', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  const offlineBanner = (page: Parameters<typeof logIn>[0]) =>
    page.getByRole('status').filter({ hasText: 'offline' })

  const navLink = (page: Parameters<typeof logIn>[0], name: string) =>
    page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name })

  test('serves cached pages and shows the banner while offline', async ({
    context,
    page,
  }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    // Visit the exercise library online so its first page lands in the cache.
    await page.goto('/exercises')
    // The route is the stable handle here: every exercise in the library is a
    // link to its own page, and the create link carries no name inside it.
    const firstExercise = page.locator('a[href^="/exercises/"] strong').first()
    await expect(firstExercise).toBeVisible()
    const exerciseName = (await firstExercise.innerText()).trim()

    await navLink(page, 'Home').click()
    await expect(page).toHaveURL(/\/home$/)

    await context.setOffline(true)
    try {
      // In-app navigation must keep working from the cache, with the banner up.
      await navLink(page, 'Exercises').click()
      await expect(offlineBanner(page)).toBeVisible()
      await expect(
        page.locator('a[href^="/exercises/"] strong').filter({ hasText: exerciseName }).first(),
      ).toBeVisible()
    } finally {
      await context.setOffline(false)
    }

    await expect(offlineBanner(page)).toHaveCount(0)
  })

  // A failed fetch used to be indistinguishable from an empty list: the library
  // came back "No exercises yet" for an account that has a full one.
  test('tells a failed list apart from an empty one, and reloads it on retry', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    await page.route('**/ListExercises', (route) => route.abort())
    await navLink(page, 'Exercises').click()
    await expect(page).toHaveURL(/\/exercises$/)

    const failure = page.getByRole('alert').filter({ hasText: 'Something went wrong' })
    await expect(failure).toBeVisible()
    await expect(page.getByText('No exercises yet')).toHaveCount(0)

    await page.unroute('**/ListExercises')
    await failure.getByRole('button', { name: 'Try again' }).click()

    await expect(page.locator('a[href^="/exercises/"] strong').first()).toBeVisible()
    await expect(failure).toHaveCount(0)
  })

  // Tapping "Log in" against an unreachable server used to do nothing at all.
  test('says so when a sign-in cannot reach the server', async ({ page }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    await page.goto('/logout')
    await expect(page).toHaveURL(/\/login$/)

    await page.route('**/Login', (route) => route.abort())
    await page.getByLabel('Email address').fill('alex@example.test')
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByRole('alert')).toContainText('offline')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('completes a workout offline and syncs it on reconnect @mutation', async ({
    context,
    page,
  }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    // The options are the buttons that name something; the sheet's close and
    // load-more controls carry no name of their own. The seeded cardio
    // exercise is skipped: the lines below log weight and reps.
    const option = picker
      .getByRole('button')
      .filter({ has: page.locator('strong') })
      .filter({ hasNotText: 'Cardio' })
      .first()
    const exerciseName = (await option.locator('strong').innerText()).trim()
    await option.click()

    await context.setOffline(true)
    let synced: Promise<unknown> | undefined
    try {
      await page
        .getByRole('textbox', { name: `${exerciseName} set 1 weight`, exact: true })
        .fill('40')
      await page
        .getByRole('textbox', { name: `${exerciseName} set 1 reps`, exact: true })
        .fill('12')

      // Finishing without internet is a success, not an error: the workout is
      // stored on the device, the draft is gone, and the user is back home.
      await page.getByRole('button', { name: 'Complete exercise' }).click()
      await page.getByRole('button', { name: 'Finish workout' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Finish and save' }).click()
      await expect(page.getByText('Workout saved on this device')).toBeVisible()
      await expect(page).toHaveURL(/\/home$/)
      await expect(offlineBanner(page)).toContainText('1 change will sync')

      // Armed before reconnecting so the replayed save cannot slip past it.
      synced = page.waitForResponse(
        (response) => response.url().includes('CreateWorkout') && response.ok(),
      )
    } finally {
      await context.setOffline(false)
    }

    // Reconnecting replays the queued save without any further interaction.
    await synced
    await page.goto('/workout')
    // Scoped to the history: the quick-start card at the top of the screen is
    // also a link, and it is called Quick workout too.
    const history = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Previous workouts' }) })
    await expect(history.getByRole('link', { name: /Quick workout/ }).first()).toBeVisible()
  })
})
