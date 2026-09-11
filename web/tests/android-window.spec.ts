import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Everything Android paints around the page: the launch screen it draws
// before the WebView is up, and the bars it keeps at the edges afterwards.
// Both come out of the theme rather than out of the app, and both are the
// app's own canvas, so neither is anything the web tests can see. This is
// their cover.

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
    expect(attribute('windowSplashScreenBackground')).toBe('@color/app_canvas')
    expect(attribute('windowSplashScreenAnimatedIcon')).toBe('@drawable/splash_mark')
    // The splash image the Capacitor template names here is never painted, and
    // a theme that still names it reads as though it were.
    expect(attribute('android:background')).toBeUndefined()
  })

  it('leaves the splash theme behind once the app is up', () => {
    expect(attribute('postSplashScreenTheme')).toBe('@style/AppTheme.NoActionBar')
  })

  it('hands over on the boot splash’s own canvas in either palette', () => {
    expect(colour('app_canvas', 'values')).toBe(canvas('light'))
    expect(colour('app_canvas', 'values-night')).toBe(canvas('dark'))
  })

  // The bar itself, photographed from the boot splash the way the iOS launch
  // image is, so the two cannot drift apart. One per palette, because the
  // launch screen hands over to a splash that has already read the device's.
  it('carries the bar in either palette', () => {
    for (const drawable of ['drawable-xxxhdpi', 'drawable-night-xxxhdpi'])
      expect(existsSync(res(drawable, 'splash_mark.png'))).toBe(true)
  })
})

// The app runs to every edge of the screen, and the strips the system keeps
// for itself are part of that: left alone, Android paints the navigation bar
// black and the status bar its own primary, and either reads as a band the
// app stops at. Painting both the canvas is only the device's answer — the
// reader's own is CanvasPlugin's, once the app is up.
describe('android system bars', () => {
  const appTheme = /<style name="AppTheme.NoActionBar"([\s\S]*?)<\/style>/.exec(styles)?.[1] ?? ''
  const bar = (name: string) =>
    new RegExp(`<item name="android:${name}">\\s*([^<]+?)\\s*</item>`).exec(appTheme)?.[1]

  it('paints both bars in the canvas the page runs to', () => {
    expect(bar('statusBarColor')).toBe('@color/app_canvas')
    expect(bar('navigationBarColor')).toBe('@color/app_canvas')
  })
})
