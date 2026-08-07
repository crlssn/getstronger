import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Page, type TestInfo } from '@playwright/test'

const email = process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'john@doe.com'
const password = process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? '123'

export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`)
      })
      page.on('requestfailed', (request) => {
        const reason = request.failure()?.errorText ?? 'unknown error'
        if (!reason.includes('ERR_ABORTED'))
          errors.push(`request failed: ${request.method()} ${request.url()} (${reason})`)
      })
      page.on('response', (response) => {
        if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`)
      })

      await use(errors)
      if (!allowsRuntimeErrors(test.info())) {
        expect(
          errors,
          'The page should not emit console/page errors, failed requests, or receive 5xx responses',
        ).toEqual([])
      }
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

export const allowRuntimeErrors = {
  description: 'This scenario intentionally exercises a failed request',
  type: 'allow-runtime-errors',
}

const allowsRuntimeErrors = (testInfo: TestInfo) =>
  testInfo.annotations.some((annotation) => annotation.type === allowRuntimeErrors.type)

export const expectAccessible = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  expect(
    results.violations.map(({ help, id, nodes }) => ({
      help,
      id,
      targets: nodes.map((node) => node.target.join(' ')),
    })),
    'The page should have no WCAG A/AA accessibility violations',
  ).toEqual([])
}

export const uniqueName = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
