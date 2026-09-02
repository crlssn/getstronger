import {
  allowRuntimeErrors,
  expect,
  logIn,
  logInAs,
  newUserEmail,
  openProfileActions,
  resetSeedData,
  scrollToListEnd,
  seedPassword,
  test,
  uniqueName,
  waitForHome,
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
      page.getByRole('region', { name: 'Search' }).getByRole('link', { name: /Jane Doe/ }),
    ).toBeVisible()

    // The handle is searchable too, and the result leads with it.
    await search.fill('janedoe')
    await page
      .getByRole('region', { name: 'Search' })
      .getByRole('link', { name: /janedoe/ })
      .click()

    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('button', { name: 'Profile actions' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
  })

  test('opens a feed workout and posts a comment @mutation', async ({ page }) => {
    const card = page.getByRole('listitem').filter({ hasText: '@janedoe' }).first()
    await expect(card).toBeVisible()
    await card.getByRole('link', { name: /View .* workout details/ }).click()

    await expect(page.getByRole('link', { name: '@janedoe', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible()

    const comment = uniqueName('Strong session')
    await page.getByLabel('Add a comment').fill(comment)
    await page.getByRole('button', { name: 'Post comment' }).click()
    await expect(page.getByText(comment, { exact: true })).toBeVisible()
  })

  // Shown is seen: the feed marks what arrived since it was last on screen,
  // and showing it once is what clears the mark — nothing has to be opened.
  test('marks a workout logged since the feed was last shown @mutation', async ({
    browser,
    page,
  }) => {
    // Every home visit moves the line to now, so a visit is only over once
    // the server has been told about it.
    const showHome = async () => {
      const marked = page.waitForResponse('**/api.v1.FeedService/MarkFeedAsSeen')
      await page.goto('/home')
      await waitForHome(page)
      await marked
    }

    // Nobody follows the new persona, so the active one does: a followee whose
    // only workout will be the one logged during this test.
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page
      .getByRole('searchbox', { name: 'Search people, routines, plans, exercises', exact: true })
      .fill('Sam Taylor')
    await page
      .getByRole('region', { name: 'Search' })
      .getByRole('link', { name: /Sam Taylor/ })
      .click()
    await page.getByRole('button', { name: 'Follow Sam Taylor' }).click()
    await expect(page.getByRole('button', { name: 'Profile actions' })).toBeVisible()

    // Logging in showed the feed once already, so nothing is new now.
    await showHome()
    await expect(page.getByText('New workout')).toHaveCount(0)

    // Sam logs a session in a browser of their own.
    const samsBrowser = await browser.newContext()
    const sam = await samsBrowser.newPage()
    await logInAs(sam, newUserEmail, seedPassword)
    const exerciseName = uniqueName('Goblet squat')
    await sam.goto('/exercises')
    await sam.getByRole('link', { name: 'New exercise' }).click()
    await sam.locator('form input[type="text"]').first().fill(exerciseName)
    await sam.getByRole('button', { name: 'Create exercise' }).click()
    await expect(sam).toHaveURL(/\/exercises$/)
    await sam.goto('/workouts/quick')
    await sam.getByRole('button', { name: 'Choose exercise' }).click()
    await sam
      .getByRole('dialog', { name: 'Add exercise' })
      .getByRole('button', { name: exerciseName })
      .click()
    await sam.getByRole('textbox', { name: `${exerciseName} set 1 weight`, exact: true }).fill('20')
    await sam.getByRole('textbox', { name: `${exerciseName} set 1 reps`, exact: true }).fill('10')
    await sam.getByRole('button', { name: 'Complete exercise' }).click()
    await sam.getByRole('button', { name: 'Finish workout' }).click()
    await sam
      .getByRole('dialog', { name: 'Finish workout?' })
      .getByRole('button', { name: 'Finish and save' })
      .click()
    await expect(sam).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    await samsBrowser.close()

    // Sam's session is the one new thing on the feed.
    await showHome()
    const fresh = page.getByRole('listitem').filter({ hasText: 'New workout' })
    await expect(fresh).toHaveCount(1)
    await expect(fresh).toContainText('@sam')

    // Shown once, it is no longer new.
    await page.reload()
    await waitForHome(page)
    await expect(page.getByText('New workout')).toHaveCount(0)
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
    // Scoped to the feed's own row: other surfaces may raise alerts of their
    // own about the unreachable backend.
    const failure = page.getByRole('alert').filter({ hasText: 'Latest workouts could not be' })
    await expect(failure).toBeVisible()
    await failure.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: '@' }).first()).toBeVisible()
    await scrollToListEnd(page, page.getByText(/all caught up/))
    await expect(page.getByText("You're all caught up")).toBeVisible()
  })
})

test.describe('profiles and notifications', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('loads seeded notifications and follows their destinations @smoke', async ({ page }) => {
    const meNavigation = page.getByRole('link', { name: /Me$/ })
    // The badge is a bare number beside the label, so the link carries it.
    await expect(meNavigation).toContainText('2')
    await meNavigation.click()

    // The count is in the control's own name now, not only in the red disc
    // beside it — a colour says nothing to a reader who cannot see it.
    const notificationsLink = page.getByRole('link', { name: 'Notifications, 2 unread' })
    await expect(notificationsLink).toBeVisible()
    await notificationsLink.click()
    await expect(page).toHaveURL(/\/notifications$/)
    // Each row already carries a screen-reader-only "Unread notification"
    // while it is unread, which is a better handle than the class that styles
    // the dot beside it.
    const rows = page.getByRole('listitem').filter({ has: page.getByRole('link') })
    await expect(rows).toHaveCount(4)
    await expect(rows.filter({ hasText: 'Unread notification' })).toHaveCount(2)
    await expect(rows.filter({ hasNotText: 'Unread notification' })).toHaveCount(2)

    await page.getByRole('button', { name: 'Mark all read' }).click()
    await expect(rows.filter({ hasText: 'Unread notification' })).toHaveCount(0)
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
    await page.getByRole('link', { name: '@janedoe', exact: true }).first().click()

    await openProfileActions(page)
    await page.getByRole('menuitem', { name: 'Unfollow Jane Doe' }).click()
    await expect(page.getByRole('button', { name: 'Follow Jane Doe' })).toBeVisible()
    await page.getByRole('button', { name: 'Follow Jane Doe' }).click()
    await expect(page.getByRole('button', { name: 'Profile actions' })).toBeVisible()

    const tabs = page.getByRole('navigation', { name: 'Profile sections' })
    for (const tab of ['Personal bests', 'Follows', 'Followers', 'Workouts']) {
      await tabs.getByRole('link', { name: tab, exact: true }).click()
      await expect(tabs.getByRole('link', { name: tab, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
    }
  })

  // Both lists read the same follow edge from opposite ends, so only a
  // one-directional follow tells them apart. Alex and Jane follow each other in
  // the seed; dropping one direction is what makes the two lists disagree.
  test('separates who follows a profile from who it follows @mutation', async ({ page }) => {
    await page.goto('/home')
    await page.getByRole('link', { name: '@janedoe', exact: true }).first().click()
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    const profile = page.url()

    await openProfileActions(page)
    await page.getByRole('menuitem', { name: 'Unfollow Jane Doe' }).click()
    await expect(page.getByRole('button', { name: 'Follow Jane Doe' })).toBeVisible()

    const tabs = page.getByRole('navigation', { name: 'Profile sections' })
    await tabs.getByRole('link', { name: 'Follows', exact: true }).click()
    await expect(page.getByRole('link', { name: /@alex/ })).toBeVisible()

    await tabs.getByRole('link', { name: 'Followers', exact: true }).click()
    await expect(page.getByText('No followers yet')).toBeVisible()

    // Put the seeded follow back for whatever runs next.
    await page.goto(profile)
    await page.getByRole('button', { name: 'Follow Jane Doe' }).click()
    await expect(page.getByRole('button', { name: 'Profile actions' })).toBeVisible()
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
    // The card's heading is "Training volume"; the figure under it is the
    // value that heading names, so it is reached by its id.
    const volumeHeading = page.locator('#training-volume')
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

    const firstRecord = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Personal records' }) })
      .getByRole('link')
      .first()
    await expect(firstRecord).toBeVisible()
    await firstRecord.click()
    await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/)
  })

  test('charts a run in metres and pace, one point per interval @smoke', async ({ page }) => {
    await page.goto('/exercises')
    await page
      .locator('a')
      .filter({ has: page.getByText('Run', { exact: true }) })
      .click()

    // Every interval is its own point, so the headline reads the latest set —
    // 0.72 km — in metres rather than a kilometre value rounded up to "1 km".
    await expect(page.getByText('720 m', { exact: true })).toBeVisible()

    // 0.72 km in 4 minutes is 5:33 min/km.
    await page.getByRole('button', { name: 'Pace' }).click()
    await expect(page.getByText('5:33 min/km', { exact: true })).toBeVisible()

    // The logged sets read sub-kilometre distances in metres too.
    await expect(page.getByText('720 m · 4 min (5:33 min/km)').first()).toBeVisible()
  })

  test('opens the current user public profile from account settings', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('link', { name: /Public profile/ }).click()
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Follow|Unfollow/ })).toHaveCount(0)
  })
})
