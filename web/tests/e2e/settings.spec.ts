import { allowRuntimeErrors, expect, logIn, resetSeedData, test } from './fixtures'

test.beforeAll(resetSeedData)

// The profile is where a preference is found, and each one now lives on a
// screen of its own. What these pin is the whole path: the row on the profile
// says what the setting is set to, the screen behind it changes it, and the
// change survives a reload because it reached the account rather than the tab.
test.describe('settings', () => {
  test.beforeEach(async ({ page }) => logIn(page))

  const settings = (page: Parameters<typeof logIn>[0]) =>
    page.getByRole('region', { name: 'Settings' })

  test('opens a setting from a row that says what it is set to @smoke', async ({ page }) => {
    await page.goto('/profile')

    const units = settings(page).getByRole('link', { name: /Units/ })
    await expect(units).toContainText('kg · km')

    await units.click()
    await expect(page).toHaveURL(/\/settings\/units$/)
    await expect(page.getByRole('heading', { name: 'Units' })).toBeVisible()
  })

  test('keeps a changed unit across a reload, and says so on the way back @mutation', async ({
    page,
  }) => {
    await page.goto('/settings/units')

    const unit = page.getByRole('group', { name: 'Preferred weight unit' })
    await unit.getByRole('button', { name: 'lbs', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')

    // Reloaded, so the value comes back from the account rather than from the
    // store the click left behind.
    await page.reload()
    await expect(unit.getByRole('button', { name: 'lbs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Units/ })).toContainText('lbs · km')

    // Put the seeded default back: the account is shared with the tests after
    // this one, and a preference is exactly the kind of state that leaks.
    await page.goto('/settings/units')
    await unit.getByRole('button', { name: 'kg', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')
  })

  // The one setting that is not on the account: it is kept on the device, so
  // what proves it landed is the app itself changing language, and staying
  // changed after a reload.
  test('changes the language on the device and keeps it', async ({ page }) => {
    await page.goto('/settings/language')
    await page.getByRole('button', { name: 'Svenska', exact: true }).click()

    // The screen it was chosen on is the first thing read back in it.
    await expect(page.getByRole('heading', { name: 'Språk' })).toBeVisible()

    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Jag', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Språk/ })).toContainText('Svenska')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Jag', exact: true })).toBeVisible()

    // And handing it back to the device is a choice of its own.
    await page.goto('/settings/language')
    await page.getByRole('button', { name: /Enhetens språk/ }).click()
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible()
  })

  // Like the language, the palette is kept on the device: what proves it
  // landed is the page repainting the moment it is picked, and staying dark
  // after a reload.
  test('changes the appearance on the device and keeps it', async ({ page }) => {
    await page.goto('/settings/appearance')
    await page.getByRole('button', { name: 'Dark', exact: true }).click()

    // Applied without a reload: the attribute every token reads is already on
    // the root element, and the canvas behind the page is the dark one.
    //
    // The body's own colour is load-bearing beyond the page: inside the native
    // app the keyboard plugin reads it to paint the strip the WebView gives up
    // when the keyboard rises (autoBackdropColor in mobile/capacitor.config.ts).
    // Move the canvas off body and that strip goes black again, in silence.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(22, 21, 18)')

    await page.goto('/profile')
    await expect(page.getByRole('link', { name: /Appearance/ })).toContainText('Dark')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // And handing it back to the device is a choice of its own — this suite
    // runs in a light-preference browser, so System resolves light.
    await page.goto('/settings/appearance')
    await page.getByRole('button', { name: /Device appearance/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 241, 237)')
  })

  // The cue is only ever heard, and only on a phone in a pocket, so the row
  // is where the lead can be read and the screen behind it is where it moves.
  test('changes the interval cue lead and keeps it', async ({ page }) => {
    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Interval cue/ })).toContainText(
      '10 seconds before the end',
    )

    await settings(page)
      .getByRole('link', { name: /Interval cue/ })
      .click()
    await expect(page).toHaveURL(/\/settings\/interval-cue$/)
    await page.getByRole('button', { name: '20 seconds before the end' }).click()
    await expect(page.getByRole('button', { name: '20 seconds before the end' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Kept on the device, so a reload is what proves it landed.
    await page.reload()
    await expect(page.getByRole('button', { name: '20 seconds before the end' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Interval cue/ })).toContainText(
      '20 seconds before the end',
    )

    // Silence is a choice of its own, and the row says so rather than showing
    // a lead of zero.
    await page.goto('/settings/interval-cue')
    await page.getByRole('button', { name: /Off/ }).click()
    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Interval cue/ })).toContainText('Off')
  })

  // A level, a lead and a pair of notes are all things that only exist when
  // heard, so each row answers in the voice it is choosing between. The
  // synthesiser is stubbed because a browser in CI has no voice to speak with.
  test('plays an example of the sound setting just chosen', async ({ page }) => {
    type Spied = Window & { spokenExamples?: string[] }
    await page.addInitScript(() => {
      const spoken: string[] = []
      ;(window as Spied).spokenExamples = spoken
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        spoken.push(utterance.text)
      }
    })
    // Reset by every navigation, because the script runs again on each one.
    const spoken = () => page.evaluate(() => (window as Spied).spokenExamples ?? [])

    await page.goto('/settings/announcements')
    await page.getByRole('button', { name: 'Low' }).click()
    await expect.poll(spoken).toEqual(['Run for 2 minutes'])

    await page.goto('/settings/interval-cue')
    await page.getByRole('button', { name: '5 seconds before the end', exact: true }).click()
    await expect.poll(spoken).toEqual(['5 seconds'])

    // Put the device's defaults back for the tests after this one.
    await page.goto('/settings/announcements')
    await page.getByRole('button', { name: 'Full' }).click()
    await page.goto('/settings/interval-cue')
    await page.getByRole('button', { name: '10 seconds before the end' }).click()
  })

  // The one preference on the profile the account knows nothing about. The
  // recorder half of this is native-only, so what a browser can pin is the
  // switch, what it says when it is turned on, and that it survives a reload.
  test('turns the half-way call on, says it, and keeps it', async ({ page }) => {
    type Spied = Window & { spokenExamples?: string[] }
    await page.addInitScript(() => {
      const spoken: string[] = []
      ;(window as Spied).spokenExamples = spoken
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        spoken.push(utterance.text)
      }
    })

    await page.goto('/profile')
    const call = page.getByRole('switch', { name: 'Call the half-way point' })
    await expect(call).toHaveAttribute('aria-checked', 'false')

    await call.click()
    await expect
      .poll(() => page.evaluate(() => (window as Spied).spokenExamples ?? []))
      .toEqual(['Half way. Pace 5:00 per kilometre'])

    // Kept on the device, so a reload is what proves it landed.
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Call the half-way point' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // Put the device's default back for the tests after this one.
    await page.getByRole('switch', { name: 'Call the half-way point' }).click()
  })

  // The tones a recording plays are compared against one of the athlete's own
  // sessions, or against none: three choices, so a screen of its own. Kept on
  // the device with the appearance and the language rather than on the account.
  test('chooses the session the pace tones compare with, and keeps it', async ({ page }) => {
    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Pace tones/ })).toContainText('Off')

    await settings(page)
      .getByRole('link', { name: /Pace tones/ })
      .click()
    await expect(page).toHaveURL(/\/settings\/pace-tones$/)
    await expect(page.getByRole('button', { name: /Off/ })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: /Best session/ }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: /Best session/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.goto('/profile')
    await expect(settings(page).getByRole('link', { name: /Pace tones/ })).toContainText(
      'Best session',
    )

    // Put the device's default back: this browser is shared with the tests
    // after it, and a preference is exactly the kind of state that leaks.
    await page.goto('/settings/pace-tones')
    await page.getByRole('button', { name: /Off/ }).click()
  })

  // System is live: while the app is open, the device changing its palette
  // repaints the page with no navigation.
  test('follows the device while it moves', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  // The details are the one settings screen with a save button, because the
  // two fields are typed rather than picked and half a username is not a
  // choice anybody meant to make.
  test('edits the name from the account screen @mutation', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible()

    // The identity row is one way in; the settings row is the other. The whole
    // row goes, name and handle included, rather than a pencil under it.
    const identity = page.getByRole('link', { name: /Edit profile/ })
    await expect(identity).toHaveAccessibleName(/Alex Morgan/)
    await expect(identity).toHaveAccessibleName(/@alex/)
    await identity.click()
    await expect(page).toHaveURL(/\/settings\/account$/)

    // Nothing typed yet, so there is nothing to save.
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Alex Morgan-Reid')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Profile updated')

    // It came back from the backend, not from the draft still in memory.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
      'Alex Morgan-Reid',
    )
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alex Morgan-Reid' })).toBeVisible()
  })

  test('refuses a username someone else holds @mutation', async ({ page }, testInfo) => {
    // The taken-username attempt intentionally draws a 4xx from the backend.
    testInfo.annotations.push(allowRuntimeErrors)

    await page.goto('/settings/account')
    const username = page.getByRole('textbox', { name: 'Username' })
    await username.fill('janedoe')
    await page.getByRole('button', { name: 'Save changes' }).click()

    // Inline in the form, beside the field to correct — never a toast.
    await expect(page.getByRole('alert')).toContainText('already taken')
    await expect(page.getByRole('status')).toBeHidden()
    await expect(username).toHaveValue('janedoe')

    await username.fill('alex.morgan')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Profile updated')

    await page.goto('/profile')
    await expect(page.getByText('@alex.morgan · Edit profile', { exact: true })).toBeVisible()
  })

  // One form holds both fields, so one save can change both — and each lands
  // as its own request.
  test('edits the name and the handle together @mutation', async ({ page }) => {
    await page.goto('/settings/account')

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Alexandra Morgan')
    await page.getByRole('textbox', { name: 'Username' }).fill('alexandra')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Profile updated')

    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Alexandra Morgan' })).toBeVisible()
    await expect(page.getByText('@alexandra · Edit profile', { exact: true })).toBeVisible()
  })

  // A settings row has no save button, so a refused change has to put the
  // control back and say why where the tap happened.
  test('puts the control back and says why when the save fails', async ({ page }, testInfo) => {
    testInfo.annotations.push(allowRuntimeErrors)

    let refuse = true
    await page.route('**/api.v1.UserService/UpdateUserWeightUnit', async (route) => {
      if (!refuse) return route.continue()
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'internal', message: 'nope' }),
      })
    })

    await page.goto('/settings/units')
    const unit = page.getByRole('group', { name: 'Preferred weight unit' })
    await unit.getByRole('button', { name: 'lbs', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('Could not update weight unit')
    await expect(unit.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // The same tap again, with the backend answering, saves it.
    refuse = false
    await unit.getByRole('button', { name: 'lbs', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Weight unit updated')
    await expect(unit.getByRole('button', { name: 'lbs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
