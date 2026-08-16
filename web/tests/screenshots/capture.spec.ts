import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  authenticatedPages,
  guestPages,
  personas,
  resolveIds,
  type Ids,
  type PageEntry,
} from './catalogue'
import { outputRoot, skippedPath } from './paths'

// Captures run past the fold, which is the point of a review pass, but stop
// short of an endless feed: an image tall enough to need its own scrollbar is
// no easier to read than the app. Set SCREENSHOT_MAX_HEIGHT to 844 for
// viewport-sized images, or to a large number for uncapped ones.
const maxHeight = Number(process.env.SCREENSHOT_MAX_HEIGHT ?? 4000)
const width = 390

const settle = async (page: Page) => {
  await expect(page.locator('.loading-card')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // Charts and list transitions render a frame after their data arrives.
  await page.waitForTimeout(300)
}

const capture = async (page: Page, folder: string, index: number, name: string, path: string) => {
  const file = join(outputRoot, folder, `${String(index).padStart(2, '0')}-${name}.png`)
  await page.goto(path)
  await settle(page)
  await mkdir(dirname(file), { recursive: true })

  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.screenshot({
    animations: 'disabled',
    clip: { height: Math.min(height, maxHeight), width, x: 0, y: 0 },
    fullPage: true,
    path: file,
  })
}

const logIn = async (page: Page, email: string, password: string) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await settle(page)
}

// A page this persona cannot reach is recorded rather than captured, so the
// contact sheet can say why an expected screenshot is missing.
const recordSkip = async (folder: string, name: string, reason: string) => {
  await mkdir(outputRoot, { recursive: true })
  await appendFile(skippedPath, `${JSON.stringify({ folder, name, reason })}\n`)
}

test.describe('guest', () => {
  test.describe.configure({ mode: 'serial' })

  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
  })

  test.afterAll(async () => {
    await context.close()
  })

  guestPages.forEach((entry, index) => {
    test(`guest ${entry.name}`, async () => {
      await capture(page, 'guest', index + 1, entry.name, entry.path({}) as string)
    })
  })
})

personas.forEach((persona) => {
  test.describe(persona.name, () => {
    test.describe.configure({ mode: 'serial' })

    let context: BrowserContext
    let ids: Ids
    let page: Page

    test.beforeAll(async ({ browser }) => {
      context = await browser.newContext()
      page = await context.newPage()
      await logIn(page, persona.email, persona.password)
      ids = await resolveIds(page, settle)
    })

    test.afterAll(async () => {
      await context.close()
    })

    authenticatedPages.forEach((entry: PageEntry, index) => {
      test(`${persona.name} ${entry.name}`, async () => {
        const path = entry.path(ids)
        if (!path) {
          const reason = `${persona.email} has no seeded data behind this page`
          await recordSkip(persona.name, entry.name, reason)
          test.skip(true, reason)
          return
        }

        await capture(page, persona.name, index + 1, entry.name, path)
      })
    })
  })
})
