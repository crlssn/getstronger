// Renders the store-asset source images in assets/ from the repo's canonical
// barbell mark (web/src/assets/barbell.svg), so the icons never drift from the
// brand. Run `npm run assets` to rebuild the sources and regenerate the
// platform icons and splash screens.
//
// The splash reproduces the login header: the barbell tile next to the
// wordmark and slogan. Text renders with the system font stack the app itself
// uses, so regenerate on macOS for faithful output.
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const TILE = '#25282d' // The brand tile behind the barbell; the web theme-color.
const SURFACE = '#ffffff' // The login header surface the splash mimics.
const TITLE = '#25282d'
const SLOGAN = '#64748b'

const BARBELL = new URL('../../web/src/assets/barbell.svg', import.meta.url)
const OUT = new URL('../assets/', import.meta.url)

const barbellSvg = (await readFile(BARBELL, 'utf8')).replaceAll('currentColor', '#ffffff')
const barbell = (size) =>
  sharp(Buffer.from(barbellSvg), { density: 300 }).resize(size, size).png().toBuffer()

const canvas = (size, background) =>
  sharp({ create: { width: size, height: size, channels: 4, background } })

// The rounded brand tile with the barbell inside, like the login header mark.
const tile = async (size, radius) => {
  const shape = `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${TILE}"/></svg>`
  return sharp(Buffer.from(shape))
    .composite([{ input: await barbell(Math.round(size * 0.72)) }])
    .png()
    .toBuffer()
}

// The login-header lockup: tile, wordmark, slogan. Sized to survive the
// centre crop that aspect-fill performs on tall phone screens.
const lockup = async () => {
  const text = `<svg width="720" height="260">
    <text x="0" y="110" font-family="Helvetica Neue, Arial, sans-serif" font-size="96" font-weight="bold" fill="${TITLE}">GetStronger</text>
    <text x="4" y="200" font-family="Helvetica Neue, Arial, sans-serif" font-size="52" fill="${SLOGAN}">Lift it. Log it. Beat it.</text>
  </svg>`
  return sharp({ create: { width: 1000, height: 260, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await tile(240, 56), left: 0, top: 10 },
      { input: Buffer.from(text), left: 280, top: 30 },
    ])
    .png()
    .toBuffer()
}

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

// Splash: the login header lockup centred on its surface, identical in light
// and dark because the app renders a light UI in both.
const splash = canvas(2732, SURFACE).composite([{ input: await lockup() }])
await write(splash.clone(), 'splash.png')
await write(splash.clone(), 'splash-dark.png')

console.log('asset sources written to mobile/assets/')
