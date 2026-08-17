// Renders the store-asset source images in assets/ from the repo's canonical
// logo (web/src/assets/logo-mono.svg), so the icons never drift from the
// brand mark. Run `npm run assets` to rebuild the sources and regenerate the
// platform icons and splash screens.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const BACKGROUND = '#25282d' // Matches the web app's theme-color.
const LOGO = new URL('../../web/src/assets/logo-mono.svg', import.meta.url)
const OUT = new URL('../assets/', import.meta.url)

const logoSvg = (await readFile(LOGO, 'utf8')).replaceAll('currentColor', '#ffffff')
const logoPng = (size) => sharp(Buffer.from(logoSvg), { density: 300 }).resize(size, size).toBuffer()

const canvas = (size, background) =>
  sharp({ create: { width: size, height: size, channels: 4, background } })

const compose = async (file, size, logoSize, background) => {
  await canvas(size, background)
    .composite([{ input: await logoPng(logoSize) }])
    .png()
    .toFile(new URL(file, OUT).pathname)
}

await mkdir(OUT, { recursive: true })

// iOS icon: opaque, logo at ~62% like the in-app brand mark.
await compose('icon-only.png', 1024, 640, BACKGROUND)
// Android adaptive icon: the outer ~25% of the foreground is masked away by
// the launcher shape, so the logo sits inside the safe zone.
await compose('icon-foreground.png', 1024, 512, { r: 0, g: 0, b: 0, alpha: 0 })
await canvas(1024, BACKGROUND).png().toFile(new URL('icon-background.png', OUT).pathname)
// Splash: generated for both light and dark from the same dark artwork,
// matching the SplashScreen backgroundColor in capacitor.config.ts.
await compose('splash.png', 2732, 512, BACKGROUND)
await compose('splash-dark.png', 2732, 512, BACKGROUND)

console.log('asset sources written to mobile/assets/')
