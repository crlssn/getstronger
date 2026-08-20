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
    const firstExercise = page.locator('.exercise-group-card a strong').first()
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
        page.locator('.exercise-group-card a strong').filter({ hasText: exerciseName }).first(),
      ).toBeVisible()
    } finally {
      await context.setOffline(false)
    }

    await expect(offlineBanner(page)).toHaveCount(0)
  })

  test('completes a workout offline and syncs it on reconnect @mutation', async ({
    context,
    page,
  }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    await page.goto('/workouts/quick')
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    const option = picker.locator('.exercise-options button').first()
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
      await page.locator('.primary-action').click()
      await page.locator('.primary-action').click()
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
    await expect(
      page.locator('.history-list a strong').filter({ hasText: 'Quick workout' }).first(),
    ).toBeVisible()
  })
})
