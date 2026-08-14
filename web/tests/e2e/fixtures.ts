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
        if (!isNavigationCancellation(reason))
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

export const logInAs = async (page: Page, userEmail: string, userPassword: string) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(userEmail)
  await page.getByLabel('Password', { exact: true }).fill(userPassword)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await waitForHome(page)
}

export const logIn = async (page: Page) => logInAs(page, email, password)

export const waitForHome = async (page: Page) => {
  await expect(page.locator('.loading-card')).toHaveCount(0)
  await expect(page.locator('.feed-end, .feed-empty, .feed-error')).toBeVisible()
}

export const allowRuntimeErrors = {
  description: 'This scenario intentionally exercises a failed request',
  type: 'allow-runtime-errors',
}

const allowsRuntimeErrors = (testInfo: TestInfo) =>
  testInfo.annotations.some((annotation) => annotation.type === allowRuntimeErrors.type)

const isNavigationCancellation = (reason: string) =>
  ['ERR_ABORTED', 'NS_BINDING_ABORTED'].some((value) => reason.includes(value)) ||
  /^(cancelled|canceled)$/i.test(reason.trim())

export const expectAccessible = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  expect(
    results.violations.map(({ help, id, nodes }) => ({
      help,
      id,
      nodes: nodes.map((node) => ({
        failureSummary: node.failureSummary,
        html: node.html,
        target: node.target.join(' '),
      })),
    })),
    'The page should have no WCAG A/AA accessibility violations',
  ).toEqual([])
}

export const uniqueName = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
