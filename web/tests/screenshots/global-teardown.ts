import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { personas } from './catalogue'
import { contactSheetPath, outputRoot, skippedPath } from './paths'

type Skip = { folder: string; name: string; reason: string }

const readSkips = async (): Promise<Skip[]> => {
  const contents = await readFile(skippedPath, 'utf8').catch(() => '')
  return contents
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Skip)
}

const readImages = async (folder: string) => {
  const entries = await readdir(join(outputRoot, folder)).catch(() => [])
  return entries.filter((entry) => entry.endsWith('.png')).sort()
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`)

const section = (folder: string, description: string, images: string[], skips: Skip[]) => `
    <section>
      <h2>${escapeHtml(folder)}</h2>
      <p class="description">${escapeHtml(description)}</p>
      <div class="grid">
        ${images
          .map(
            (image) => `<figure>
          <a href="${folder}/${image}"><img src="${folder}/${image}" alt="${escapeHtml(image)}" loading="lazy" /></a>
          <figcaption>${escapeHtml(image.replace(/^\d+-|\.png$/g, ''))}</figcaption>
        </figure>`,
          )
          .join('\n        ')}
      </div>
      ${
        skips.length === 0
          ? ''
          : `<p class="skipped">Not captured: ${skips
              .map((skip) => escapeHtml(skip.name))
              .join(', ')} — ${escapeHtml(skips[0].reason)}.</p>`
      }
    </section>`

// The images are only useful if they can be compared side by side, so a run
// finishes by writing a contact sheet that opens in a browser.
export default async () => {
  const skips = await readSkips()
  const folders = [
    { description: 'Pages a signed-out visitor sees', name: 'guest' },
    ...personas.map((persona) => ({ description: persona.description, name: persona.name })),
  ]

  const captures = await Promise.all(
    folders.map(async ({ description, name }) => ({
      description,
      images: await readImages(name),
      name,
    })),
  )

  const sections = captures.map(({ description, images, name }) =>
    section(
      name,
      description,
      images,
      skips.filter((skip) => skip.folder === name),
    ),
  )

  await writeFile(
    contactSheetPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GetStronger mobile screenshots</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 1600px; padding: 2rem; }
      h1 { margin-bottom: 0.25rem; }
      h2 { margin-bottom: 0.25rem; text-transform: capitalize; }
      .description, .generated { color: color-mix(in srgb, currentColor 60%, transparent); margin-top: 0; }
      .grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
      figure { margin: 0; }
      /* Long pages are cropped to keep the grid scannable; the link opens the whole capture. */
      img { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 12px; max-height: 720px; object-fit: cover; object-position: top; width: 100%; }
      figcaption { font-size: 0.85rem; padding-top: 0.5rem; }
      .skipped { color: color-mix(in srgb, currentColor 60%, transparent); font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <h1>Mobile screenshots</h1>
    <p class="generated">390 px wide at 2× density, generated ${new Date().toLocaleString()}</p>
${sections.join('\n')}
  </body>
</html>
`,
  )

  const captured = captures.reduce((total, { images }) => total + images.length, 0)
  console.log(
    `\n📸  ${captured} screenshots written to ${relative(process.cwd(), outputRoot)}\n    Open the contact sheet: open ${relative(process.cwd(), contactSheetPath)}\n`,
  )
}
