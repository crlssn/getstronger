import {
  allowRuntimeErrors,
  expect,
  expectAccessible,
  logIn,
  test,
  uniqueName,
  waitForHome,
} from './fixtures'

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

  test('creates an account and requires email verification @mutation', async ({ page }) => {
    test.info().annotations.push(allowRuntimeErrors)
    const email = `${uniqueName('e2e-signup').replaceAll(' ', '-')}@example.com`.toLowerCase()

    await page.goto('/signup')
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Member')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('StrongPassword123!')
    await page.getByLabel('Confirm password').fill('StrongPassword123!')
    await page.getByText('Pounds', { exact: true }).click()
    await expect(page.getByRole('radio', { name: /Pounds/ })).toBeChecked()
    await page.getByRole('button', { name: 'Create an account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('status')).toContainText(
      'Please check your inbox to verify your email',
    )

    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('StrongPassword123!')
    const verificationMessage = new Promise<string>((resolve) =>
      page.once('dialog', async (dialog) => {
        resolve(dialog.message())
        await dialog.dismiss()
      }),
    )
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect.poll(() => verificationMessage).toContain('verify your email')
    await expect(page).toHaveURL(/\/login$/)
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
