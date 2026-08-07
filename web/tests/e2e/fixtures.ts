import { expect, test as base, type Page } from '@playwright/test'

const email = process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'john@doe.com'
const password = process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? '123'

export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('response', (response) => {
        if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`)
      })

      await use(errors)
      expect(errors, 'The page should not emit runtime errors or receive 5xx responses').toEqual([])
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'

export const logIn = async (page: Page) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
}
