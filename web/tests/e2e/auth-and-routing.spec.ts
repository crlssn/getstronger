import {
  allowRuntimeErrors,
  boxOf,
  expect,
  expectAccessible,
  logIn,
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
    await expect(page.getByText('Track your training. Beat your last.')).toBeVisible()
    await expectAccessible(page)

    await page.getByRole('link', { name: 'Create an account' }).click()
    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByText('Track your training. Beat your last.')).toBeVisible()
    await expect(page.getByRole('radio', { name: /Kilograms/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /Pounds/ })).not.toBeChecked()

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

    const dialogMessage = new Promise<string>((resolve) =>
      page.once('dialog', async (dialog) => {
        resolve(dialog.message())
        await dialog.dismiss()
      }),
    )
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect.poll(() => dialogMessage).toContain('invalid credentials')
    await expect(page).toHaveURL(/\/login$/)
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
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Member')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByText('Pounds', { exact: true }).click()
    await expect(page.getByRole('radio', { name: /Pounds/ })).toBeChecked()
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

    // The alert sits below the header rather than on top of it, and its
    // contents line up with the column the page content uses.
    const header = await boxOf(page.locator('header.guest-header'))
    const alert = await boxOf(page.getByRole('status'))
    const alertIcon = await boxOf(page.locator('.alert-card-inner .status-icon'))
    const heading = await boxOf(page.getByRole('heading', { name: 'Reset your password' }))

    expect(alert.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(Math.abs(alertIcon.x - heading.x)).toBeLessThan(2)
  })

  test('shows the not-found route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
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
