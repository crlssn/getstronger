import {
  allowRuntimeErrors,
  boxOf,
  expect,
  expectAccessible,
  logIn,
  logInAs,
  resetSeedData,
  test,
  uniqueName,
  verificationToken,
  waitForHome,
} from './fixtures'

test.beforeAll(resetSeedData)

test.describe('guest authentication and routing', () => {
  test('routes guests through the public authentication pages @smoke', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Log in to GetStronger' })).toBeVisible()
    await expect(page.getByText('Lift it. Log it. Beat it.')).toBeVisible()
    await expectAccessible(page)

    await page.getByRole('link', { name: 'Create an account' }).click()
    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByText('Lift it. Log it. Beat it.')).toBeVisible()
    await expect(page.getByLabel('Username')).toBeVisible()

    await page.getByRole('link', { name: 'Log in', exact: true }).click()
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  })

  test('rejects invalid credentials without authenticating', async ({ page }) => {
    test.info().annotations.push(allowRuntimeErrors)
    await page.goto('/login')
    await page.getByLabel('Email address').fill('nobody@example.com')
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')

    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByRole('alert')).toContainText('invalid credentials')
    await expect(page).toHaveURL(/\/login$/)

    // A toast goes on its own, but the button that takes it early is subject to
    // the 44px floor like any other control.
    const dismiss = await boxOf(page.getByRole('button', { name: 'Dismiss message' }))
    expect(dismiss.height).toBeGreaterThanOrEqual(44)
    expect(dismiss.width).toBeGreaterThanOrEqual(44)
  })

  test('signs up, resends the verification link, verifies and logs in @mutation', async ({
    page,
  }) => {
    // The flow spans signup, a login attempt, a resend and the verification
    // link, and reads the token straight from the database.
    test.slow()
    test.info().annotations.push(allowRuntimeErrors)
    const email = `${uniqueName('e2e-signup').replaceAll(' ', '-')}@example.com`.toLowerCase()
    const password = 'StrongPassword123!'

    await page.goto('/signup')
    await page.getByLabel('Name', { exact: true }).fill('E2E Member')
    // The name suggests the username, so most people never touch that field.
    await expect(page.getByLabel('Username')).toHaveValue('e2emember')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)

    // Units are not asked for here; the account starts metric and is changed
    // in the profile.
    await expect(page.getByText('Preferred weight unit')).toHaveCount(0)
    await expect(page.getByText('Preferred distance unit')).toHaveCount(0)

    // A username someone already holds is refused with a clear message and
    // leaves the rest of the form intact.
    await page.getByLabel('Username').fill('alex')
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('alert')).toContainText('already taken')
    await expect(page).toHaveURL(/\/signup$/)

    await page.getByLabel('Username').fill(`e2e.${Date.now()}`)
    await page.getByRole('button', { name: 'Create an account' }).click()

    // The notice says the link was sent, not that the account is verified.
    await expect(page).toHaveURL(/\/verify-email\/pending$/)
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
    await expect(page.getByText('Waiting for verification')).toBeVisible()
    await expect(page.getByText('Your account is not verified yet')).toBeVisible()
    // The destination is masked rather than printed in full.
    await expect(page.getByText(`@${email.split('@')[1]}.`)).toBeVisible()
    await expect(page.getByText(email, { exact: true })).toHaveCount(0)
    // The signup email already counts towards the resend rate limit.
    await expect(page.getByRole('button', { name: /Send again in \d+s/ })).toBeDisabled()
    await expectAccessible(page)

    // Logging in before verifying returns to the same actionable state.
    await page.goto('/login')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/verify-email\/pending$/)

    // A reload without the stored address still offers a way to resend.
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Send a new link' }).click()
    await expect(page.getByRole('status')).toContainText('a new link is on its way')
    await expect(page.getByRole('button', { name: /Send again in \d+s/ })).toBeDisabled()

    await page.goto(`/verify-email?token=${verificationToken(email)}`)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toContainText('Thank you for verifying your email')

    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/home$/)

    // A new account is metric until the profile says otherwise.
    await page.goto('/profile')
    await expect(
      page
        .getByRole('group', { name: 'Preferred weight unit' })
        .getByRole('button', { name: 'Kilograms' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page
        .getByRole('group', { name: 'Preferred distance unit' })
        .getByRole('button', { name: 'Kilometers' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('accepts password reset requests without exposing account existence', async ({ page }) => {
    await page.goto('/forgot-password')
    await page
      .getByLabel('Email address')
      .fill(`${uniqueName('unknown').replaceAll(' ', '-')}@example.com`)
    await page.getByRole('button', { name: 'Send reset link' }).click()

    await expect(page.getByRole('status')).toContainText(
      'Please check your inbox to reset your password',
    )
    await expect(page.getByLabel('Email address')).toHaveValue('')

    // The toast floats near the top of the viewport, clear of both edges, and
    // stays inside the column the rest of the page is read in.
    const toast = await boxOf(page.getByRole('status'))
    const viewport = page.viewportSize()

    expect(toast.y).toBeGreaterThan(0)
    expect(toast.y).toBeLessThan((viewport?.height ?? 0) / 2)
    expect(toast.x).toBeGreaterThan(0)
    expect(toast.x + toast.width).toBeLessThanOrEqual(viewport?.width ?? 0)

    // Nothing has to be tapped for it to go: it takes itself away.
    await expect(page.getByRole('status')).toBeHidden({ timeout: 15_000 })
  })

  // The stores need a policy URL that opens without an account.
  test('opens the privacy policy without signing in @smoke', async ({ page }) => {
    await page.goto('/privacy')

    await expect(page).toHaveURL(/\/privacy$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'What we store' })).toBeVisible()
    await expectAccessible(page)
  })

  test('shows the not-found route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})

// Apple and Google both require an account created in the app to be deletable
// from inside it, so this walks the whole route: a real account is signed up,
// verified, deleted, and then proven gone by trying to sign back in.
test.describe('account deletion', () => {
  test('deletes the account and everything it owns @mutation', async ({ page }) => {
    test.slow()
    test.info().annotations.push(allowRuntimeErrors)

    const email = `${uniqueName('e2e-delete').replaceAll(' ', '-')}@example.com`.toLowerCase()
    const password = 'StrongPassword123!'

    await page.goto('/signup')
    await page.getByLabel('Name', { exact: true }).fill('E2E Leaver')
    await page.getByLabel('Username').fill(`e2e.leaver.${Date.now()}`)
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page).toHaveURL(/\/verify-email\/pending$/)

    await page.goto(`/verify-email?token=${verificationToken(email)}`)
    await expect(page).toHaveURL(/\/login$/)
    await logInAs(page, email, password)

    // Something of the account's own, so the deletion has data to take with it.
    await page.goto('/exercises/create')
    const exercise = uniqueName('Leaver Press')
    await page.locator('form input[type="text"]').first().fill(exercise)
    await page.getByRole('button', { name: 'Save Exercise' }).click()
    await expect(page).toHaveURL(/\/exercises$/)
    await expect(page.getByText(exercise)).toBeVisible()

    await page.goto('/profile')
    await page
      .getByRole('region', { name: 'Danger zone' })
      .getByRole('button', { name: 'Delete account' })
      .click()

    const sheet = page.getByRole('dialog')
    await expect(sheet).toContainText('cannot be undone')

    // A wrong password is refused without ending the session or the sheet.
    await sheet.getByLabel('Confirm with your password').fill('not-the-password')
    await sheet.getByRole('button', { name: 'Delete my account' }).click()
    await expect(sheet.getByRole('alert')).toContainText('That password is not correct.')
    await expect(page).toHaveURL(/\/profile$/)

    await sheet.getByLabel('Confirm with your password').fill(password)
    await sheet.getByRole('button', { name: 'Delete my account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toContainText('Your account has been deleted.')

    // The account is gone from the server, not just from this browser.
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toContainText('invalid credentials')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('authenticated session routing', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  test('persists the session across reloads and keeps guests out of auth pages @smoke', async ({
    page,
  }) => {
    await page.reload()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    await waitForHome(page)

    await page.goto('/login')
    await expect(page).toHaveURL(/\/home$/)
  })

  // Not @smoke: Safari and Firefox cap cookie lifetimes on their own terms, so
  // only Chromium says anything reliable about what the server asked for.
  test('keeps the refresh token for the thirty days the session lasts', async ({ page }) => {
    const cookie = (await page.context().cookies()).find(({ name }) => name === 'refreshToken')
    expect(cookie, 'Logging in should store a refresh-token cookie').toBeDefined()

    const thirtyDays = 30 * 24 * 60 * 60
    const lifetime = (cookie?.expires ?? 0) - Date.now() / 1000
    // An upper bound as well as a lower one: a Max-Age in the wrong unit is
    // clamped by the browser to its own cap rather than rejected, so only the
    // ceiling shows the difference between thirty days and four hundred.
    expect(lifetime).toBeGreaterThan(thirtyDays - 60 * 60)
    expect(lifetime).toBeLessThanOrEqual(thirtyDays)
  })

  test('logs out and protects the session after reload @mutation', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('link', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logs out when a protected endpoint reports an expired session', async ({ page }) => {
    test.info().annotations.push(allowRuntimeErrors)
    await page.route('**/api.v1.UserService/GetUser', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'unauthenticated', message: 'session expired' }),
      })
    })

    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logs out when the current user no longer exists', async ({ page }) => {
    test.info().annotations.push(allowRuntimeErrors)
    await page.route('**/api.v1.UserService/GetUser', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'not_found', message: 'user not found' }),
      })
    })

    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login$/)
  })
})
