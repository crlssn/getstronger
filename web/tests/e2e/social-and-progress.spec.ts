import {
  allowRuntimeErrors,
  expect,
  logIn,
  openProfileActions,
  resetSeedData,
  scrollToListEnd,
  test,
  uniqueName,
} from './fixtures'

test.beforeAll(resetSeedData)

test.describe('social feed and discovery', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('searches for people and navigates to their profile @smoke', async ({ page }) => {
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const search = page.getByRole('searchbox', {
      name: 'Search people, routines, plans, exercises',
      exact: true,
    })

    await search.fill('Ja')
    await expect(page.getByText('Type at least 3 characters to search.')).toBeVisible()
    await search.fill('Jane')
    await expect(
      page.locator('.search-panel').getByRole('link', { name: /Jane Doe/ }),
    ).toBeVisible()

    // The handle is searchable too, and the result leads with it.
    await search.fill('janedoe')
    await page
      .locator('.search-panel')
      .getByRole('link', { name: /janedoe/ })
      .click()

    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('button', { name: 'Profile actions' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
  })

  test('opens a feed workout and posts a comment @mutation', async ({ page }) => {
    const card = page.locator('.feed-summary-card').filter({ hasText: 'Jane Doe' }).first()
    await expect(card).toBeVisible()
    await card.getByRole('link', { name: /View .* workout details/ }).click()

    await expect(page.getByRole('link', { name: 'janedoe', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible()

    const comment = uniqueName('Strong session')
    await page.getByLabel('Add a comment').fill(comment)
    await page.getByRole('button', { name: 'Post comment' }).click()
    await expect(page.getByText(comment, { exact: true })).toBeVisible()
  })

  test('shows a recoverable feed error and retries successfully', async ({ page }) => {
    test.info().annotations.push(allowRuntimeErrors)
    let failed = false
    await page.route('**/api.v1.FeedService/ListFeedItems', async (route) => {
      if (!failed) {
        failed = true
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        return
      }
      await route.continue()
    })

    // An unreachable feed with a cached copy silently shows saved data; the
    // recoverable error is the contract for when nothing is cached yet.
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('offlineCache:')) window.localStorage.removeItem(key)
      }
    })
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('Latest workouts could not be loaded')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('.feed-summary-card').first()).toBeVisible()
    await scrollToListEnd(page, '.feed-end')
    await expect(page.getByText("You're all caught up")).toBeVisible()
  })
})

test.describe('profiles and notifications', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('loads seeded notifications and follows their destinations @smoke', async ({ page }) => {
    const meNavigation = page.getByRole('link', { name: /Me$/ })
    await expect(meNavigation.locator('.notification-badge')).toHaveText('2')
    await meNavigation.click()

    const notificationsLink = page.getByRole('link', { name: 'Notifications' })
    await expect(notificationsLink.locator('.notification-badge')).toHaveText('2')
    await notificationsLink.click()
    await expect(page).toHaveURL(/\/notifications$/)
    await expect(page.locator('.notification-item.unread')).toHaveCount(2)
    await expect(page.locator('.notification-item:not(.unread)')).toHaveCount(2)

    await page.getByRole('button', { name: 'Mark all read' }).click()
    await expect(page.locator('.notification-item.unread')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)

    const janeNotification = page.getByRole('link').filter({ hasText: 'janedoe' }).first()
    await expect(janeNotification).toBeVisible()
    const notificationText = await janeNotification.innerText()
    await janeNotification.click()

    if (notificationText.includes('commented')) {
      await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    } else {
      await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    }
  })

  test('toggles following and exposes every public profile section @mutation', async ({ page }) => {
    await page.goto('/home')
    await page.getByRole('link', { name: 'janedoe', exact: true }).first().click()

    await openProfileActions(page)
    await page.getByRole('menuitem', { name: 'Unfollow Jane Doe' }).click()
    await expect(page.getByRole('button', { name: 'Follow Jane Doe' })).toBeVisible()
    await page.getByRole('button', { name: 'Follow Jane Doe' }).click()
    await expect(page.getByRole('button', { name: 'Profile actions' })).toBeVisible()

    const tabs = page.getByRole('navigation', { name: 'Profile sections' })
    for (const tab of ['Personal Bests', 'Follows', 'Followers', 'Workouts']) {
      await tabs.getByRole('link', { name: tab, exact: true }).click()
      await expect(tabs.getByRole('link', { name: tab, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
    }
  })
})

test.describe('account progress', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('navigates profile shortcuts and changes the progress period @smoke @responsive', async ({
    page,
  }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible()
    await expect(page.getByLabel('Training summary')).toContainText('workouts')

    await page.getByRole('link', { name: /Progress & records/ }).click()
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
    const periods = page.getByLabel('Progress period')
    const volumeHeading = page.locator('.chart-heading h2')
    const volumes: number[] = []
    for (const period of ['7D', '4W', '3M', '1Y']) {
      await periods.getByRole('button', { name: period }).click()
      await expect(periods.getByRole('button', { name: period })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      volumes.push(Number((await volumeHeading.innerText()).replace(/[^0-9]/g, '')))
    }
    // Each wider range adds workouts on top of the narrower one, so the volume
    // must grow — a chart stuck on stale data reports the same number four
    // times (issue #987).
    for (let i = 1; i < volumes.length; i += 1) {
      expect(volumes[i]).toBeGreaterThan(volumes[i - 1])
    }

    const firstRecord = page.locator('.record-list a').first()
    await expect(firstRecord).toBeVisible()
    await firstRecord.click()
    await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/)
  })

  test('edits the username from the profile and rejects a taken one @mutation', async ({
    page,
  }) => {
    // The taken-username attempt intentionally draws a 4xx from the backend.
    test.info().annotations.push(allowRuntimeErrors)
    await page.goto('/profile')
    await expect(page.getByText('@alex', { exact: true })).toBeVisible()

    // A handle someone else holds is refused with a clear message.
    await page.getByRole('button', { name: 'Change username' }).click()
    const usernameInput = page.getByRole('textbox', { name: 'Username' })
    await usernameInput.fill('janedoe')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('alert')).toContainText('already taken')
    await expect(usernameInput).toBeVisible()

    // A free handle saves, closes the sheet, and shows immediately.
    await usernameInput.fill('alex.morgan')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('@alex.morgan', { exact: true })).toBeVisible()
    await expect(usernameInput).toHaveCount(0)
  })

  test('opens the current user public profile from account settings', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('link', { name: /Public profile/ }).click()
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Follow|Unfollow/ })).toHaveCount(0)
  })
})
