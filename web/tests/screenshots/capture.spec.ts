import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { appendFile, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import {
  authenticatedPages,
  guestPages,
  personas,
  resolveIds,
  type Ids,
  type PageEntry,
} from './catalogue'
import { inspect } from './inspect'
import { outputRoot, recordsPath, viewport, type PageRecord } from './paths'

// A page is photographed one screen at a time rather than as a single tall
// image: a fold is what a phone actually shows, it keeps sticky headers and the
// bottom navigation where a reader sees them, and every file stays small enough
// to be read without being scaled down to an illegible strip.
const maxFolds = Number(process.env.SCREENSHOT_MAX_FOLDS ?? 4)
// A fold shorter than this is a sliver of the previous one, not a screen.
const foldTolerance = 120

const settle = async (page: Page) => {
  await expect(page.locator('.loading-card')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // Charts and list transitions render a frame after their data arrives.
  await page.waitForTimeout(300)
}

const captureFolds = async (page: Page, folder: string, prefix: string) => {
  // A re-capture may need fewer folds than the run before it, and a leftover
  // image of a page that has since become shorter is a lie.
  await mkdir(join(outputRoot, folder), { recursive: true })
  const existing = await readdir(join(outputRoot, folder))
  for (const file of existing.filter((name) => name.startsWith(prefix))) {
    await rm(join(outputRoot, folder, file))
  }

  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  const folds = Math.min(
    Math.max(Math.ceil((height - foldTolerance) / viewport.height), 1),
    maxFolds,
  )
  const images: string[] = []

  for (let fold = 0; fold < folds; fold += 1) {
    if (fold > 0) {
      await page.evaluate((offset) => window.scrollTo(0, offset), fold * viewport.height)
      await page.waitForTimeout(200)
    }

    const file = join(
      outputRoot,
      folder,
      folds === 1 ? `${prefix}.png` : `${prefix}-${fold + 1}.png`,
    )
    await mkdir(dirname(file), { recursive: true })
    await page.screenshot({ animations: 'disabled', path: file })
    images.push(relative(outputRoot, file))
  }

  await page.evaluate(() => window.scrollTo(0, 0))
  return images
}

const record = async (entry: PageRecord) => {
  await mkdir(outputRoot, { recursive: true })
  await appendFile(recordsPath, `${JSON.stringify(entry)}\n`)
}

const capture = async (
  page: Page,
  persona: string,
  index: number,
  entry: PageEntry,
  route: string,
) => {
  await page.goto(route)
  await settle(page)
  if (entry.prepare) await entry.prepare(page)
  await settle(page)

  const prefix = `${String(index).padStart(2, '0')}-${entry.name}`
  await record({
    component: entry.component,
    findings: await inspect(page, viewport.width),
    images: await captureFolds(page, persona, prefix),
    name: entry.name,
    persona,
    route,
    title: await page.title(),
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
      await capture(page, 'guest', index + 1, entry, entry.route({}) as string)
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

    authenticatedPages.forEach((entry, index) => {
      test(`${persona.name} ${entry.name}`, async () => {
        const route = entry.route(ids)
        if (!route) {
          const reason = `${persona.email} has no seeded data behind this page`
          await record({
            component: entry.component,
            images: [],
            name: entry.name,
            persona: persona.name,
            reason,
          })
          test.skip(true, reason)
          return
        }

        await capture(page, persona.name, index + 1, entry, route)
      })
    })
  })
})
