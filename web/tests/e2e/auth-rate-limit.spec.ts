import { localAuthRatePolicy } from '../auth-rate-policy'
import { allowRuntimeErrors, expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

test('shows exhausted authentication budgets inline and lets another account sign in @mutation', async ({
  page,
  request,
}) => {
  test.info().annotations.push(allowRuntimeErrors)
  const email = 'rate-limit-unknown@example.test'
  const endpoint = `http://localhost:${process.env.E2E_SERVER_PORT ?? '18180'}/api.v1.AuthService/Login`
  for (
    let attempt = 0;
    attempt < Number(localAuthRatePolicy.AUTH_RATE_ACCOUNT_ATTEMPTS);
    attempt++
  ) {
    const response = await request.post(endpoint, {
      data: { email, password: 'incorrect' },
    })
    expect(response.status()).toBe(400)
    await response.dispose()
  }

  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('incorrect')
  const refused = page.waitForResponse(
    (response) => response.url().endsWith('/api.v1.AuthService/Login') && response.status() === 429,
  )
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await refused
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'Too many attempts. Please try again later.',
  )
  await expect(page).toHaveURL(/\/login$/)
  await logIn(page)
  await expect(page).toHaveURL(/\/home$/)
})
