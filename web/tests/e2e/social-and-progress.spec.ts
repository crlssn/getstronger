import { allowRuntimeErrors, expect, logIn, test, uniqueName } from './fixtures'

test.describe('social feed and discovery', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('searches for people and navigates to their profile @smoke', async ({ page }) => {
    await page.getByRole('button', { name: 'Search people' }).click()
    const search = page.getByRole('searchbox', { name: 'Search people' })

    await search.fill('Ja')
    await expect(page.getByText('Type at least 3 characters to find someone.')).toBeVisible()
    await search.fill('Jane')
    await page
      .locator('.search-panel')
      .getByRole('link', { name: /Jane Doe/ })
      .click()

    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('button', { name: 'Unfollow Jane' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
  })

  test('opens a feed workout and posts a comment @mutation', async ({ page }) => {
    const card = page.locator('.feed-summary-card').filter({ hasText: 'Jane Doe' }).first()
    await expect(card).toBeVisible()
    await card.getByRole('link', { name: /View .* workout details/ }).click()

    await expect(page.getByRole('link', { name: 'Jane Doe', exact: true }).first()).toBeVisible()
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

    await page.reload()
    await expect(page.getByRole('alert')).toContainText('Latest workouts could not be loaded')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('.feed-summary-card').first()).toBeVisible()
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

    const janeNotification = page.getByRole('link').filter({ hasText: 'Jane Doe' }).first()
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
    await page.getByRole('link', { name: 'Jane Doe', exact: true }).first().click()

    const unfollow = page.getByRole('button', { name: 'Unfollow Jane' })
    await expect(unfollow).toBeVisible()
    await unfollow.click()
    await expect(page.getByRole('button', { name: 'Follow Jane' })).toBeVisible()
    await page.getByRole('button', { name: 'Follow Jane' }).click()
    await expect(page.getByRole('button', { name: 'Unfollow Jane' })).toBeVisible()

    const tabs = page.getByRole('navigation', { name: 'Profile sections' })
    for (const tab of ['Personal Bests', 'Follows', 'Followers', 'Workouts']) {
      await tabs.getByRole('link', { name: tab, exact: true }).click()
      await expect(tabs.getByRole('link', { name: tab, exact: true })).toHaveClass(/active/)
    }
  })
})

test.describe('account progress', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('navigates profile shortcuts and changes the progress period @smoke @responsive', async ({
    page,
  }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'John Doe' })).toBeVisible()
    await expect(page.getByLabel('Training summary')).toContainText('workouts')

    await page.getByRole('link', { name: /Progress & records/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Progress you can read at a glance' }),
    ).toBeVisible()
    const periods = page.getByLabel('Progress period')
    for (const period of ['7D', '4W', '3M', '1Y']) {
      await periods.getByRole('button', { name: period }).click()
      await expect(periods.getByRole('button', { name: period })).toHaveClass(/active/)
    }

    const firstRecord = page.locator('.record-list a').first()
    await expect(firstRecord).toBeVisible()
    await firstRecord.click()
    await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/)
  })

  test('opens the current user public profile from account settings', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('link', { name: /Public profile/ }).click()
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Follow|Unfollow/ })).toHaveCount(0)
  })
})
