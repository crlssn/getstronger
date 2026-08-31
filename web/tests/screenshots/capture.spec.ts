import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import {
  audienceName,
  authenticatedPages,
  guestPages,
  personas,
  resolveIds,
  themes,
  type Ids,
  type PageEntry,
  type Theme,
} from './catalogue'
import { flows, recordName } from './flows'
import { inspect } from './inspect'
import { clockPath, outputRoot, recordsPath, viewport, type PageRecord } from './paths'

// A page is photographed one screen at a time rather than as a single tall
// image: a fold is what a phone actually shows, it keeps sticky headers and the
// bottom navigation where a reader sees them, and every file stays small enough
// to be read without being scaled down to an illegible strip.
const maxFolds = Number(process.env.SCREENSHOT_MAX_FOLDS ?? 4)
// A fold shorter than this is a sliver of the previous one, not a screen.
const foldTolerance = 120

// Every context renders against the moment the seeded data was captured rather
// than against the wall clock. Two runs minutes apart otherwise differ on the
// relative timestamps alone — "just now" becoming "3 minutes ago" moved 26 of
// 58 pages — and a workout's elapsed time, counted from a Date.now() the same
// clock now answers, holds still with it.
const freezeClock = async (context: BrowserContext) => {
  const recorded = (await readFile(clockPath, 'utf8').catch(() => '')).trim()
  if (recorded) await context.clock.setFixedTime(new Date(recorded))
}

const newContext = async (browser: Browser, theme: Theme) => {
  // Chart.js grows its bars and lines out of the axis over about a second, on a
  // canvas — where Playwright's `animations: 'disabled'`, which only reaches
  // CSS, cannot follow. Photographed after the usual settle, every chart in
  // this set was a third of the way through that: an empty plot with the
  // latest value pinned to the baseline, and a line that looked flat beside a
  // header saying it had dropped 26%. A whole design audit read those pictures
  // as a broken chart.
  //
  // Asking for stillness is what the charts answer, so the picture is of the
  // chart rather than of its entrance.
  // The palette comes from the emulated device, not from a stored choice, so
  // a dark capture photographs the System mode the way a dark phone gets it.
  const context = await browser.newContext({ colorScheme: theme, reducedMotion: 'reduce' })
  await freezeClock(context)

  return context
}

// A page keeps growing after its first paint: a list appends the page of results
// that was in flight, and an endless one appends again on every scroll. Two
// measurements at the same height is the end of it.
const stopGrowing = async (page: Page) => {
  let previous = -1
  for (;;) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    if (height === previous) return
    previous = height
    await page.waitForTimeout(250)
  }
}

const settle = async (page: Page) => {
  // The boot splash is swept away the frame the app mounts, and a lazy route's
  // chunk arrives after that, so a page can be blank with nothing loading on
  // it. The first page of a run pays for the dev server's first transform, and
  // it was photographed empty.
  await page.waitForFunction(() => {
    const root = document.getElementById('root')
    return !document.getElementById('boot-splash') && (root?.innerText.trim().length ?? 0) > 0
  })
  await expect(page.locator('.loading-card')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await stopGrowing(page)
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
      // Scrolling into an endless list starts the next page loading, and the
      // document grows under a scroll position the browser clamps to its
      // height. Photographed mid-load, the same fold shows a different part of
      // the same list from one run to the next.
      await settle(page)
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

const photograph = async (
  page: Page,
  persona: string,
  index: number,
  name: string,
  component: string,
  route?: string,
) => {
  await settle(page)
  const prefix = `${String(index).padStart(2, '0')}-${name}`
  await record({
    component,
    findings: await inspect(page, viewport.width),
    images: await captureFolds(page, persona, prefix),
    name,
    persona,
    route: route ?? new URL(page.url()).pathname,
    title: await page.title(),
  })
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
  await photograph(page, persona, index, entry.name, entry.component, route)
}

const logIn = async (page: Page, email: string, password: string) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await settle(page)
}

themes.forEach((theme) => {
  test.describe(audienceName('guest', theme), () => {
    test.describe.configure({ mode: 'serial' })

    let context: BrowserContext
    let page: Page

    test.beforeAll(async ({ browser }) => {
      context = await newContext(browser, theme)
      page = await context.newPage()
    })

    test.afterAll(async () => {
      await context.close()
    })

    guestPages.forEach((entry, index) => {
      test(`${audienceName('guest', theme)} ${entry.name}`, async () => {
        await capture(
          page,
          audienceName('guest', theme),
          index + 1,
          entry,
          entry.route({}) as string,
        )
      })
    })
  })

  personas.forEach((persona) => {
    const audience = audienceName(persona.name, theme)

    test.describe(audience, () => {
      test.describe.configure({ mode: 'serial' })

      let context: BrowserContext
      let ids: Ids
      let page: Page

      test.beforeAll(async ({ browser }) => {
        context = await newContext(browser, theme)
        page = await context.newPage()
        await logIn(page, persona.email, persona.password)
        ids = await resolveIds(page, settle)
      })

      test.afterAll(async () => {
        await context.close()
      })

      authenticatedPages.forEach((entry, index) => {
        test(`${audience} ${entry.name}`, async () => {
          const route = entry.route(ids)
          if (!route) {
            const reason = `${persona.email} has no seeded data behind this page`
            await record({
              component: entry.component,
              images: [],
              name: entry.name,
              persona: audience,
              reason,
            })
            test.skip(true, reason)
            return
          }

          await capture(page, audience, index + 1, entry, route)
        })
      })

      // Flows come last within a persona: they create an exercise, a routine, a
      // plan, and a workout, and every page above would otherwise show them.
      const personaFlows = flows.filter((flow) => flow.personas.includes(persona.name))

      personaFlows.forEach((flow, flowIndex) => {
        test(`${audience} flow ${flow.name}`, async () => {
          const before = personaFlows
            .slice(0, flowIndex)
            .reduce((total, earlier) => total + earlier.steps.length, 0)

          try {
            for (const [stepIndex, step] of flow.steps.entries()) {
              await step.act(page)
              await photograph(
                page,
                audience,
                authenticatedPages.length + before + stepIndex + 1,
                recordName(flow, step),
                flow.component,
              )
            }
          } finally {
            // A flow that broke halfway still created something.
            await flow.cleanup?.(page)
          }
        })
      })
    })
  })
})
