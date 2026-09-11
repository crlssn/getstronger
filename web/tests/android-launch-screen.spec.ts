import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// iOS shows the boot splash at launch as a picture, so a photograph of the
// splash is all it needs. Android does not take one: from Android 12 the
// system draws the launch screen itself, from theme attributes, and the
// `android:background` Capacitor's template points at the splash image with is
// never painted. These are the resources that put the boot splash's canvas and
// its bar on screen instead, and this is their cover.

const android = join(__dirname, '..', '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const res = (...path: string[]) => join(android, ...path)
const styles = readFileSync(res('values', 'styles.xml'), 'utf8')
const theme = readFileSync(join(__dirname, '..', 'src', 'assets', 'theme.css'), 'utf8')

// The launch theme, read back as the attributes it sets.
const launchTheme = /<style name="AppTheme.NoActionBarLaunch"([\s\S]*?)<\/style>/.exec(styles)
const attribute = (name: string) =>
  new RegExp(`<item name="${name}">\\s*([^<]+?)\\s*</item>`).exec(launchTheme?.[1] ?? '')?.[1]

// theme.css owns the palette; the launch screen restates the one value it
// needs, and this is what keeps the two from drifting apart.
const palettes = {
  dark: theme.slice(theme.indexOf(":root[data-theme='dark']")),
  light: theme.slice(0, theme.indexOf(":root[data-theme='dark']")),
}
const canvas = (palette: keyof typeof palettes) =>
  new RegExp('--color-canvas:\\s*([^;]+);').exec(palettes[palette])?.[1]?.trim()

// A colour resource, as the palette Android picks it for names it.
const colour = (name: string, values: string) =>
  new RegExp(`<color name="${name}">\\s*([^<]+?)\\s*</color>`)
    .exec(readFileSync(res(values, 'colors.xml'), 'utf8'))?.[1]
    ?.toLowerCase()

describe('android launch screen', () => {
  it('draws the launch screen through the attributes Android reads', () => {
    expect(launchTheme?.[0]).toContain('parent="Theme.SplashScreen"')
    expect(attribute('windowSplashScreenBackground')).toBe('@color/splash_canvas')
    expect(attribute('windowSplashScreenAnimatedIcon')).toBe('@drawable/splash_mark')
    // The splash image the Capacitor template names here is never painted, and
    // a theme that still names it reads as though it were.
    expect(attribute('android:background')).toBeUndefined()
  })

  it('leaves the splash theme behind once the app is up', () => {
    expect(attribute('postSplashScreenTheme')).toBe('@style/AppTheme.NoActionBar')
  })

  it('hands over on the boot splash’s own canvas in either palette', () => {
    expect(colour('splash_canvas', 'values')).toBe(canvas('light'))
    expect(colour('splash_canvas', 'values-night')).toBe(canvas('dark'))
  })

  // The bar itself, photographed from the boot splash the way the iOS launch
  // image is, so the two cannot drift apart. One per palette, because the
  // launch screen hands over to a splash that has already read the device's.
  it('carries the bar in either palette', () => {
    for (const drawable of ['drawable-xxxhdpi', 'drawable-night-xxxhdpi'])
      expect(existsSync(res(drawable, 'splash_mark.png'))).toBe(true)
  })
})
