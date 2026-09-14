import {
  allowRuntimeErrors,
  boxOf,
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

  // A run is recognised by its shape, and the feed is the first place it is
  // looked for. The shape is drawn from the recording the list already carries,
  // so the home page never reaches for a map.
  test('pictures a recorded route on the feed and keeps the map on the workout', async ({
    page,
  }) => {
    // The tile host itself, not a URL that merely mentions it: a substring
    // match here would read `openfreemap.org.example.com` as the real thing.
    const tileHost = 'openfreemap.org'
    const tiles: string[] = []
    page.on('request', (request) => {
      const { hostname } = new URL(request.url())
      if (hostname === tileHost || hostname.endsWith(`.${tileHost}`)) tiles.push(request.url())
    })
    await page.reload()
    await waitForHome(page)

    // The seed logs the guided circuit twice and records one of them, so the
    // row that draws a route is the one to follow rather than the one named.
    const recorded = page
      .getByRole('listitem')
      .filter({ has: page.locator('polyline') })
      .first()
    await expect(recorded).toContainText('Walk/Run Intervals')

    // The walk and the run keep the colours the full map gives them.
    const strokes = await recorded
      .locator('polyline')
      .evaluateAll((lines) => lines.map((line) => getComputedStyle(line).stroke))
    expect(new Set(strokes).size).toBe(2)

    // The shape stands where the author's initials would: the handle beside it
    // already says whose session it is.
    await expect(recorded.getByText('AM')).toHaveCount(0)

    // A session with nothing recorded is the row it has always been, initials
    // and all.
    const lifted = page.getByRole('listitem').filter({ hasText: '@janedoe' }).first()
    await expect(lifted.locator('polyline')).toHaveCount(0)
    await expect(lifted.getByText('JD')).toBeVisible()
    expect(tiles).toEqual([])

    // And the thumbnail's own session is the one carrying the full map.
    await recorded.getByRole('link', { name: /View .* workout details/ }).click()
    await expect(page.getByRole('heading', { name: 'Workout route' })).toBeVisible()
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
    // Three unread: the two recent comments, plus the rep the seed leaves
    // unread. The count is every unread notification, whatever its type.
    await expect(meNavigation).toContainText('3')
    await meNavigation.click()

    // The count is in the control's own name now, not only in the red disc
    // beside it — a colour says nothing to a reader who cannot see it.
    const notificationsLink = page.getByRole('link', { name: 'Notifications, 3 unread' })
    await expect(notificationsLink).toBeVisible()
    await notificationsLink.click()
    await expect(page).toHaveURL(/\/notifications$/)
    // Each row already carries a screen-reader-only "Unread notification"
    // while it is unread, which is a better handle than the class that styles
    // the dot beside it.
    //
    // Seven rows: four comments and three reps, of which one comment pair and
    // one rep are unread.
    const rows = page.getByRole('listitem').filter({ has: page.getByRole('link') })
    await expect(rows).toHaveCount(7)
    await expect(rows.filter({ hasText: 'Unread notification' })).toHaveCount(3)
    await expect(rows.filter({ hasNotText: 'Unread notification' })).toHaveCount(4)
    await expect(rows.filter({ hasText: 'repped your' })).toHaveCount(3)

    await page.getByRole('button', { name: 'Mark all read' }).click()
    await expect(rows.filter({ hasText: 'Unread notification' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)

    const janeNotification = page.getByRole('link').filter({ hasText: 'janedoe' }).first()
    await expect(janeNotification).toBeVisible()
    const notificationText = await janeNotification.innerText()
    await janeNotification.click()

    // What happened decides where the row leads: a comment and a rep are both
    // about a workout, a follow is about the person.
    if (notificationText.includes('commented') || notificationText.includes('repped')) {
      await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    } else {
      await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
    }
  })

  // The whole of the feature in one pass: the tap, the count the server kept,
  // and the row it puts in front of the athlete who trained.
  test('reps another athlete’s workout and tells them so @mutation', async ({ browser, page }) => {
    // Two personas in two browsers, and a row waited for by asking for the page
    // again: the longest flow in this file.
    test.slow()

    // Sam reps from a browser of their own, which leaves this one signed in as
    // the athlete who trained — the one the notification is for. The context
    // takes this project's phone with it, so the control is still measured
    // against a thumb.
    const samsBrowser = await browser.newContext()
    const sam = await samsBrowser.newPage()

    // Sam has no history and follows nobody, so the session is reached through
    // its owner's profile rather than through a feed.
    await logInAs(sam, newUserEmail, seedPassword)
    await sam.getByRole('button', { name: 'Search', exact: true }).click()
    await sam
      .getByRole('searchbox', { name: 'Search people, routines, plans, exercises', exact: true })
      .fill('Alex Morgan')
    await sam
      .getByRole('region', { name: 'Search' })
      .getByRole('link', { name: /Alex Morgan/ })
      .click()

    await sam
      .getByRole('navigation', { name: 'Profile sections' })
      .getByRole('link', { name: 'Workouts', exact: true })
      .click()
    // The handle sits above this link and its tap floor covers the row's
    // centre, so the tap lands in the padding beside the tile instead.
    const session = sam.getByRole('link', { name: /View .* workout details/ }).first()
    await session.click({ position: { x: 8, y: (await boxOf(session)).height / 2 } })
    // `url()` is a cached read, and a client-side navigation reaches it after
    // the click has returned: waited for, or the address kept here is the
    // profile the reload below would find no rep button on.
    await expect(sam).toHaveURL(/\/workouts\/[0-9a-f-]+$/)
    const workout = sam.url()

    const rep = sam.getByRole('button', { name: /^Rep this workout/ })
    await expect(rep).toHaveAttribute('aria-pressed', 'false')
    const before = Number(await rep.innerText())

    // An icon and a two-character count shrink to well under a thumb unless
    // the control carries the floor itself.
    const box = await boxOf(rep)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)

    // The count moves on the tap, before the server has heard about it, so the
    // request is armed here: navigating while it is still in flight cancels the
    // very write the reload below is about to read back.
    const kept = sam.waitForResponse('**/api.v1.WorkoutService/LikeWorkout')
    await rep.click()
    const repped = sam.getByRole('button', { name: /^Remove your rep/ })
    await expect(repped).toHaveAttribute('aria-pressed', 'true')
    await expect(repped).toHaveText(String(before + 1))
    expect((await kept).ok()).toBe(true)

    // Reloading reads the count back off the server rather than off the tap.
    await sam.goto(workout)
    await expect(sam.getByRole('button', { name: /^Remove your rep/ })).toHaveText(
      String(before + 1),
    )
    await samsBrowser.close()

    // The session's owner is told, and the row leads back to the workout. The
    // notification is written off an event rather than inside the request, and
    // the list is fetched once per visit, so each attempt loads the page and
    // then waits on the row rather than counting what has yet to arrive.
    const notification = page.getByRole('listitem').filter({ hasText: '@sam repped your' })
    await expect(async () => {
      await page.goto('/notifications')
      await expect(notification).toHaveCount(1, { timeout: 5_000 })
    }).toPass({ timeout: 20_000 })

    await notification.getByRole('link').click()
    await expect(page).toHaveURL(workout)
  })

  // A toggle is not a new thing to be told about. Each follow is a genuine
  // insert and announces itself, so what stops a second row is the id that
  // announcement carries: derived from the pair rather than minted per follow.
  test('tells the followee once however often a follow is toggled @mutation', async ({
    browser,
    page,
  }) => {
    // Two personas in two browsers, and a row waited for by asking for the page
    // again, as the rep flow above does.
    test.slow()

    // Sam follows from a browser of their own, which leaves this one signed in
    // as the athlete being followed — the one the notification is for.
    const samsBrowser = await browser.newContext()
    const sam = await samsBrowser.newPage()

    await logInAs(sam, newUserEmail, seedPassword)
    await sam.getByRole('button', { name: 'Search', exact: true }).click()
    await sam
      .getByRole('searchbox', { name: 'Search people, routines, plans, exercises', exact: true })
      .fill('Alex Morgan')
    await sam
      .getByRole('region', { name: 'Search' })
      .getByRole('link', { name: /Alex Morgan/ })
      .click()
    await expect(sam).toHaveURL(/\/users\/[0-9a-f-]+$/)

    const follow = sam.getByRole('button', { name: 'Follow Alex Morgan' })
    const following = sam.getByRole('button', { name: 'Profile actions' })

    const toggles = 3
    for (let toggle = 0; toggle < toggles; toggle += 1) {
      // The button swaps on the tap, before the server has heard about it, so
      // each write is armed first: toggling back while one is still in flight
      // cancels the very follow the count below is about to read.
      const recorded = sam.waitForResponse('**/api.v1.UserService/FollowUser')
      await follow.click()
      await expect(following).toBeVisible()
      expect((await recorded).ok()).toBe(true)

      const removed = sam.waitForResponse('**/api.v1.UserService/UnfollowUser')
      await openProfileActions(sam)
      await sam.getByRole('menuitem', { name: 'Unfollow Alex Morgan' }).click()
      await expect(follow).toBeVisible()
      expect((await removed).ok()).toBe(true)
    }

    await samsBrowser.close()

    // The notification is written off an event rather than inside the request,
    // and the list is fetched once per visit, so each attempt loads the page and
    // then waits on the row rather than counting what has yet to arrive.
    const followedYou = page.getByRole('listitem').filter({ hasText: '@sam followed you' })
    await expect(async () => {
      await page.goto('/notifications')
      await expect(followedYou).toHaveCount(1, { timeout: 5_000 })
    }).toPass({ timeout: 20_000 })

    // One row seen early could be the first of three. Ask again, once the
    // announcements the other two toggles raised have had their chance.
    await page.goto('/notifications')
    await expect(followedYou).toHaveCount(1)
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
