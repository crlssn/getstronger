import {
  boxOf,
  expect,
  expectAccessible,
  logIn,
  resetSeedData,
  scrollToListEnd,
  test,
} from './fixtures'
import type { CDPSession, Locator, Page } from '@playwright/test'

test.beforeAll(resetSeedData)

const authenticatedPages = [
  { path: '/home', ready: /Good (morning|afternoon|evening)/ },
  { path: '/workout', ready: 'Workout' },
  { path: '/plans', ready: 'Training' },
  { path: '/exercises', ready: 'Exercises' },
  { path: '/profile', ready: 'Alex Morgan' },
  { path: '/progress', ready: 'Progress' },
  { path: '/settings/units', ready: 'Units' },
  { path: '/settings/language', ready: 'Language' },
] as const

const waitForPageData = async (page: Page, path: string) => {
  if (path === '/workout') {
    // The history has been travelled once it says so, has nothing to say, or
    // says it could not be loaded.
    await scrollToListEnd(
      page,
      page
        .getByText(/reached the end of your workout history/)
        .or(page.getByText('Your completed workouts will appear here.'))
        .or(page.getByText('Workout history could not be loaded.')),
    )
  }
}

const expectPrimaryNavigation = async (page: Page) =>
  expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()

test('keeps the primary authenticated pages accessible @responsive', async ({ page }) => {
  await logIn(page)

  for (const destination of authenticatedPages) {
    if (new URL(page.url()).pathname !== destination.path) await page.goto(destination.path)
    await expect(page.getByRole('heading', { name: destination.ready }).first()).toBeVisible()
    await waitForPageData(page, destination.path)
    await expectPrimaryNavigation(page)
    await expectAccessible(page)
  }
})

test('keeps core layouts inside the viewport @responsive', async ({ page }) => {
  await logIn(page)

  for (const destination of authenticatedPages) {
    if (new URL(page.url()).pathname !== destination.path) await page.goto(destination.path)
    await expect(page.getByRole('heading', { name: destination.ready }).first()).toBeVisible()
    await waitForPageData(page, destination.path)
    await expectPrimaryNavigation(page)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1)
  }
})

test('supports keyboard-only home search @smoke', async ({ page }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Search', exact: true }).focus()
  await page.keyboard.press('Enter')

  const search = page.getByRole('searchbox', {
    name: 'Search people, routines, plans, exercises',
    exact: true,
  })
  await expect(search).toBeFocused()
  await expect
    .poll(() =>
      search.evaluate((element) => getComputedStyle(element).getPropertyValue('--tw-ring-shadow')),
    )
    .toContain('calc(0px + 0px)')
  // The ring belongs to the field around the input, not to the input itself,
  // so it is reached as that input's parent.
  const searchField = search.locator('xpath=..')
  await expect(searchField).toHaveCSS('border-top-style', 'solid')
  await expect
    .poll(() =>
      searchField.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--tw-ring-shadow'),
      ),
    )
    .toBe('0 0 #0000')
  await search.fill('Jane')
  const result = page
    .getByRole('region', { name: 'Search' })
    .getByRole('link', { name: /Jane Doe/ })
  await result.focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/)
  await expect(page.getByRole('navigation', { name: 'Profile sections' })).toBeVisible()
})

// theme.css calls --size-control-sm "a floor, not a step: nothing tappable goes
// below it". Icon-only buttons are where that slips, because an icon needs no
// room to read and the box shrinks to it.
const tapTargetFloor = 44

const expectAboveFloor = async (control: Locator, name: string) => {
  const box = await boxOf(control)
  expect(box.height, `${name} is ${box.height}px tall`).toBeGreaterThanOrEqual(tapTargetFloor)
  expect(box.width, `${name} is ${box.width}px wide`).toBeGreaterThanOrEqual(tapTargetFloor)
}

test('keeps icon-only controls above the tap-target floor @responsive', async ({ page }) => {
  await logIn(page)

  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expectAboveFloor(page.getByRole('button', { name: 'Close search' }), 'the search close')

  await page.goto('/plans/create')
  await page.getByRole('button', { name: 'Add routine' }).click()
  // The options are the buttons that name a routine; the sheet's close control
  // carries no name of its own.
  const firstOption = page
    .getByRole('dialog', { name: 'Choose a routine' })
    .getByRole('button')
    .filter({ has: page.locator('strong') })
    .first()
  const routineName = (await firstOption.locator('strong').innerText()).trim()
  await firstOption.click()

  // The row's two controls, named after the routine they act on, which is a
  // steadier handle than the row they happen to sit in. Up and down buttons
  // used to be here; the drag handle replaced both and takes the arrow keys.
  const reorder = [
    page.getByRole('button', { name: `Reorder ${routineName}` }),
    page.getByRole('button', { name: `Remove ${routineName}` }),
  ]
  await expect(reorder[0]).toBeVisible()
  for (const [index, control] of reorder.entries()) {
    await expectAboveFloor(control, `plan reorder control ${index + 1}`)
  }
})

// The tag chip is the one control whose ✕ cannot grow: the pill around it is
// 32px. The chip's own box is what carries the floor, and removing has to
// still work from the label, not only from the ✕.
test('removes a tag from a chip that clears the tap-target floor @responsive', async ({ page }) => {
  await logIn(page)

  await page.goto('/exercises/create')
  await page.getByRole('button', { name: 'Add tags' }).click()
  const tagInput = page.getByLabel('Add exercise tag')
  await tagInput.fill('Upper body')
  await tagInput.press('Enter')
  await tagInput.fill('Pull')
  await tagInput.press('Enter')

  const chip = page.getByRole('button', { name: 'Remove Upper body' })
  await expectAboveFloor(chip, 'the tag chip')

  // The label, not the ✕, which is the half of the chip the old button missed.
  await chip.getByText('Upper body', { exact: true }).click()
  await expect(chip).toBeHidden()
  await expect(page.getByRole('button', { name: 'Remove Pull' })).toBeVisible()
})

test('renders the not-found state accessibly', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
  await expectAccessible(page)
})

// The strip a phone reserves for its status bar and Dynamic Island, which
// viewport-fit=cover lets the page run under. A desktop browser reports zero,
// so it has to be emulated, and only Chromium's CDP can — which is why these
// stay out of the @smoke set the other engines run.
const statusBarInset = 59

const emulateStatusBarInset = async (session: CDPSession, top: number) =>
  session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, topMax: top } })

const verticalOverflow = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement
    return scroller.scrollHeight - scroller.clientHeight
  })

// main.css spends the inset as padding on the body, so a shell measuring itself
// against the whole screen asks for more height than it was left. Reading the
// padding back is what tells the emulation apart from a test that silently
// stopped emulating anything.
const insetSpent = (page: Page) =>
  page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).paddingTop))

// Each with a screen tall enough to hold it, because a scroll is only the
// shell's own doing when the page itself has nothing below the fold. Signup's
// five fields need more room than a phone has.
const guestPages = [
  { height: 844, path: '/login', ready: 'Log in to GetStronger' },
  { height: 1100, path: '/signup', ready: 'Create your account' },
  { height: 844, path: '/forgot-password', ready: 'Reset your password' },
  { height: 844, path: '/reset-password', ready: 'Choose a new password' },
] as const

test('fits the guest shell on a screen that reserves a status bar', async ({ page }) => {
  const session = await page.context().newCDPSession(page)

  for (const guest of guestPages) {
    await page.setViewportSize({ height: guest.height, width: 390 })

    // The web, where the inset is zero and this has never gone wrong.
    await emulateStatusBarInset(session, 0)
    await page.goto(guest.path)
    await expect(page.getByRole('heading', { name: guest.ready })).toBeVisible()
    expect(await verticalOverflow(page), `${guest.path} scrolls at a zero inset`).toBe(0)

    // And the phone, where reserving the strip moves the page down the screen
    // rather than lengthening the document.
    await emulateStatusBarInset(session, statusBarInset)
    await expect.poll(() => insetSpent(page)).toBe(statusBarInset)
    expect(await verticalOverflow(page), `${guest.path} scrolls by the inset`).toBe(0)
  }
})

test('still scrolls a guest screen taller than the screen it is on', async ({ page }) => {
  const session = await page.context().newCDPSession(page)
  await emulateStatusBarInset(session, statusBarInset)
  await page.setViewportSize({ height: 420, width: 390 })

  await page.goto('/signup')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expect.poll(() => insetSpent(page)).toBe(statusBarInset)
  expect(await verticalOverflow(page)).toBeGreaterThan(0)

  const last = page.getByRole('link', { name: 'Log in', exact: true })
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
})
