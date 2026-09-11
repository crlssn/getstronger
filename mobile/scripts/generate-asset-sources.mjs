// Renders the store-asset source images in assets/ from the repo's canonical
// barbell mark (web/src/assets/barbell.svg), so the icons never drift from the
// brand. Run `npm run assets` to rebuild the sources and regenerate the
// platform icons and splash screens.
//
// The splash is not drawn here at all: it is a photograph of the boot splash
// in web/index.html, taken with the motion turned off, so the launch screen
// and the animation the app hands over to cannot drift apart. That needs a
// browser, and the only one in the repo is web's Playwright — the mobile
// package has none of its own.
//
// Android's launch screen is written straight into its res/ here rather than
// left to capacitor-assets, which only knows the splash image Android stopped
// painting in 12; see the mark below.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const TILE = '#25282d' // The brand tile behind the barbell; the web theme-color.

const BARBELL = new URL('../../web/src/assets/barbell.svg', import.meta.url)
const INDEX = new URL('../../web/index.html', import.meta.url)
const PLAYWRIGHT = new URL('../../web/node_modules/playwright/index.mjs', import.meta.url)
const FONT = new URL(
  '../../web/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  import.meta.url,
)
const OUT = new URL('../assets/', import.meta.url)
const RES = '../android/app/src/main/res/'

// The square the platform tooling slices every launch image out of. Phones
// aspect-fill it, which crops to roughly the middle 46% of the width, so the
// lockup is drawn at 40% and survives the crop on the narrowest of them.
const SPLASH = 1366
const LOCKUP = Math.round(SPLASH * 0.4)

// Android's own box for the mark is 288dp, taken here at xxxhdpi so that
// every other density scales one down rather than up. The drawing has to clear
// the 192dp circle the system clips the box to, and a 310:64 bar any wider
// than 180dp loses its corners to it.
const MARK = 288 * 4
const MARK_BAR = 180 / 288

const barbellSvg = (await readFile(BARBELL, 'utf8')).replaceAll('currentColor', '#ffffff')
const barbell = (size) =>
  sharp(Buffer.from(barbellSvg), { density: 300 }).resize(size, size).png().toBuffer()

const canvas = (size, background) =>
  sharp({ create: { width: size, height: size, channels: 4, background } })

// The boot splash, parked, at whatever size and trim a launch screen wants.
// Reduced motion is emulated rather than overridden: the splash already
// answers it with the bar fully loaded on the last word, which is the one
// still frame the design states for itself. index.html is loaded whole, so the
// palette script picks the emulated scheme up and themes the splash the way it
// does on a real cold start; the app's own script tag resolves to nothing and
// is never missed.
const shoot = async (colorScheme, { size, scale, style, omitBackground }) => {
  const { chromium } = await import(PLAYWRIGHT)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: scale,
      colorScheme,
      reducedMotion: 'reduce',
    })
    await page.setContent(await readFile(INDEX, 'utf8'))
    await page.addStyleTag({ content: style })
    // The splash still fades in on its delay with the motion off, so that a
    // boot which beats it never flashes it.
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('boot-splash')).opacity === '1',
    )
    return await page.screenshot({ omitBackground })
  } finally {
    await browser.close()
  }
}

// The typeface is injected because index.html declares no @font-face — on a
// real boot the face arrives with the app bundle, a beat after the splash.
const FACE = `@font-face {
  font-family: 'Plus Jakarta Sans Variable';
  src: url(data:font/woff2;base64,${(await readFile(FONT)).toString('base64')}) format('woff2');
  font-weight: 200 800;
}`

const splash = (colorScheme) =>
  shoot(colorScheme, {
    size: SPLASH,
    scale: 2,
    style: `${FACE}
      /* 20rem on a phone, and a share of the launch square here. */
      #boot-splash .boot-lockup { width: ${LOCKUP}px; }`,
  })

// The bar on its own, on nothing: Android paints the canvas itself, as a
// colour, and centres this on it. It also clips the drawing to a circle two
// thirds the width of the box, which no lockup survives — so the words are
// left to the splash the mark hands over to a beat later.
const mark = (colorScheme) =>
  shoot(colorScheme, {
    size: MARK,
    scale: 1,
    omitBackground: true,
    style: `#boot-splash { background: transparent !important; }
      #boot-splash .boot-wordmark, #boot-splash .boot-slogan { display: none; }
      /* Sized by the bar rather than by the lockup, which is wider than its
         own drawing by the margin the splash leaves outside the sleeves. */
      #boot-splash .boot-lockup { width: ${(MARK * MARK_BAR * 320) / 310}px; }`,
  })

await mkdir(OUT, { recursive: true })

const write = (image, file) => image.png().toFile(new URL(file, OUT).pathname)

// iOS icon: opaque, the barbell at the tile's own proportions.
await write(
  canvas(1024, TILE).composite([{ input: await barbell(737) }]),
  'icon-only.png',
)
// Android adaptive icon: the outer ~25% of the foreground is masked away by
// the launcher shape, so the barbell sits inside the safe zone.
await write(
  canvas(1024, { r: 0, g: 0, b: 0, alpha: 0 }).composite([{ input: await barbell(520) }]),
  'icon-foreground.png',
)
await write(canvas(1024, TILE), 'icon-background.png')

// Splash: one per palette, because the launch screen hands over to a splash
// that has already read the reader's.
await writeFile(new URL('splash.png', OUT), await splash('light'))
await writeFile(new URL('splash-dark.png', OUT), await splash('dark'))

// And the same two for Android, as the mark its theme centres on the canvas.
for (const [colorScheme, drawable] of [
  ['light', 'drawable-xxxhdpi'],
  ['dark', 'drawable-night-xxxhdpi'],
]) {
  const out = new URL(`${RES}${drawable}/`, import.meta.url)
  await mkdir(out, { recursive: true })
  await writeFile(new URL('splash_mark.png', out), await mark(colorScheme))
}

console.log('asset sources written to mobile/assets/ and android res/')
