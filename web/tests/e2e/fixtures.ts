import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Locator, type Page, type TestInfo } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const email = process.env.E2E_USER_EMAIL ?? process.env.USER_EMAIL ?? 'active@getstronger.test'
const password = process.env.E2E_USER_PASSWORD ?? process.env.USER_PASSWORD ?? 'password123'
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

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

// Every spec calls this before its own tests so a suite that mutates seeded
// data cannot decide whether the next spec — or the next browser project —
// passes. Skipped against a deployed target, which owns its own data.
export const resetSeedData = () => {
  if (process.env.E2E_BASE_URL !== undefined) return

  execFileSync(
    'go',
    [
      'run',
      'server/testing/factory/seed/main.go',
      `-email=${email}`,
      `-password=${password}`,
      `-name=${process.env.USER_NAME ?? 'Alex Morgan'}`,
    ],
    { cwd: repositoryRoot, stdio: 'pipe' },
  )
}

// End-to-end runs use the noop email provider, so the verification link has to
// be read from the database instead of an inbox.
export const verificationToken = (userEmail: string) =>
  execFileSync('go', ['run', 'server/testing/factory/emailtoken/main.go', `-email=${userEmail}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim()

export const logInAs = async (page: Page, userEmail: string, userPassword: string) => {
  await page.goto('/login')
  // A preceding test in the same worker may have left this browser signed in,
  // and /login sends an authenticated visitor straight on to /home. That
  // redirect can land after goto() resolves, so settle on one page or the
  // other before deciding — /logout renders nothing, which makes a bare
  // `goto('/logout')` fast enough to abort its own sign-out request.
  const emailField = page.getByLabel('Email address')
  await expect(
    emailField.or(page.getByRole('navigation', { name: 'Primary navigation' })).first(),
  ).toBeVisible()
  if (!new URL(page.url()).pathname.startsWith('/login')) {
    await page.goto('/logout')
    await expect(page).toHaveURL(/\/login$/)
  }
  await emailField.fill(userEmail)
  await page.getByLabel('Password', { exact: true }).fill(userPassword)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await waitForHome(page)
}

export const logIn = async (page: Page) => logInAs(page, email, password)

export const waitForHome = async (page: Page) => {
  // `.loading-card` is the one class the app still declares globally, and it is
  // what the screenshot harness settles on too.
  await expect(page.locator('.loading-card')).toHaveCount(0)
  // The feed has settled once it says something: a workout, the caught-up
  // marker, the empty state, or the error.
  await expect(
    page
      .getByRole('link', { name: /workout details$/ })
      .or(page.getByText(/all caught up/))
      .or(page.getByText('No workouts from people you follow'))
      .or(page.getByText('Latest workouts could not be loaded.'))
      .first(),
  ).toBeVisible()
}

// Following someone turns the follow button into an entry of the profile's
// overflow menu, so the unfollow action only exists once that menu is open.
// The menu fades in, and a contrast check that runs mid-fade measures the
// transition rather than the design. Waiting for it to settle is the difference
// between a flaky accessibility assertion and a real one.
const settledMenu = async (page: Page) => {
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveCSS('opacity', '1')
}

export const openProfileActions = async (page: Page) => {
  await page.getByRole('button', { name: 'Profile actions' }).click()
  await settledMenu(page)
}

// Exercise management lives in the page header's overflow menu, so edit and
// delete only exist once that menu is open.
export const openExerciseActions = async (page: Page) => {
  await page.getByRole('button', { name: 'Exercise actions' }).click()
  await settledMenu(page)
}

// The feed and the workout history page more as their sentinel scrolls into
// view, so the end-of-list marker only exists once a reader has travelled the
// whole list. Scrolling the way a person would is what makes it appear.
export const scrollToListEnd = async (page: Page, marker: Locator, maxScrolls = 40) => {
  const target = marker.first()
  for (let scroll = 0; scroll < maxScrolls; scroll += 1) {
    if (await target.isVisible()) return
    await page.mouse.wheel(0, 20_000)
    await page.waitForTimeout(300)
  }

  await expect(target).toBeVisible()
}

export const allowRuntimeErrors = {
  description: 'This scenario intentionally exercises a failed request',
  type: 'allow-runtime-errors',
}

const allowsRuntimeErrors = (testInfo: TestInfo) =>
  testInfo.annotations.some((annotation) => annotation.type === allowRuntimeErrors.type)

// Each engine words an in-flight request dropped by a navigation differently:
// Chromium aborts, Firefox binds-aborts, WebKit cancels the load request.
const isNavigationCancellation = (reason: string) =>
  ['ERR_ABORTED', 'NS_BINDING_ABORTED', 'Load request cancelled'].some((value) =>
    reason.includes(value),
  ) || /^(cancelled|canceled)$/i.test(reason.trim())

export const expectAccessible = async (page: Page) => {
  // A menu that is fading out is still in the DOM, at whatever opacity the
  // transition has reached, and axe reads that blend as a contrast failure on
  // copy nobody can read any more. Waiting for it to leave is the difference
  // between a scan of the page and a scan of an animation frame.
  await expect(page.getByRole('menu')).toHaveCount(0)

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

// Layout assertions need a box, and an element that is missing or not rendered
// has none. Failing here says which element rather than dereferencing null.
export const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  expect(box, `${locator} should be visible and have a bounding box`).not.toBeNull()
  return box as NonNullable<typeof box>
}

export const uniqueName = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// The app confirms risky actions with its own sheet dialog rather than the
// native confirm(), so tests accept it by pressing the named button inside it.
export const acceptConfirmDialog = async (page: Page, buttonName: string) => {
  await page.getByRole('dialog').getByRole('button', { name: buttonName, exact: true }).click()
}
