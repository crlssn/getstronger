import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { authenticatedPages, guestPages, personas, type PageEntry } from './catalogue'
import {
  contactSheetPath,
  manifestPath,
  outputRoot,
  recordsPath,
  viewport,
  type Findings,
  type PageRecord,
} from './paths'

type Audience = { description: string; email?: string; name: string; pages: PageEntry[] }

const audiences: Audience[] = [
  { description: 'Pages a signed-out visitor sees', name: 'guest', pages: guestPages },
  ...personas.map((persona) => ({
    description: persona.description,
    email: persona.email,
    name: persona.name,
    pages: authenticatedPages,
  })),
]

// A re-captured page appends a second line, and the newer one wins.
const readRecords = async () => {
  const contents = await readFile(recordsPath, 'utf8').catch(() => '')
  const records = new Map<string, PageRecord>()

  for (const line of contents.split('\n').filter((value) => value !== '')) {
    const parsed = JSON.parse(line) as PageRecord
    records.set(`${parsed.persona}/${parsed.name}`, parsed)
  }

  return audiences.flatMap(({ name, pages }) =>
    pages
      .map((entry) => records.get(`${name}/${entry.name}`))
      .filter((entry) => entry !== undefined),
  )
}

const findingLines = (findings: Findings | undefined) =>
  Object.entries(findings ?? {})
    .filter(([, values]) => values.length > 0)
    .map(([finding, values]) => `${finding}: ${values.length}`)

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`)

const figure = (record: PageRecord) => `<figure>
          ${record.images
            .map(
              (image) =>
                `<a href="${image}"><img src="${image}" alt="${escapeHtml(image)}" loading="lazy" /></a>`,
            )
            .join('\n          ')}
          <figcaption>
            <strong>${escapeHtml(record.name)}</strong>
            <span>${escapeHtml(record.route ?? record.reason ?? '')}</span>
            <span>${escapeHtml(record.component)}</span>
            ${findingLines(record.findings)
              .map((line) => `<span class="finding">${escapeHtml(line)}</span>`)
              .join('\n            ')}
          </figcaption>
        </figure>`

const section = (name: string, description: string, records: PageRecord[]) => `
    <section>
      <h2>${escapeHtml(name)}</h2>
      <p class="description">${escapeHtml(description)}</p>
      <div class="grid">
        ${records
          .filter((record) => record.images.length > 0)
          .map(figure)
          .join('\n        ')}
      </div>
      ${(() => {
        const skipped = records.filter((record) => record.images.length === 0)
        return skipped.length === 0
          ? ''
          : `<p class="skipped">Not captured: ${skipped
              .map((record) => escapeHtml(record.name))
              .join(', ')} — ${escapeHtml(skipped[0].reason ?? 'unreachable')}.</p>`
      })()}
    </section>`

// The run finishes by publishing what it saw twice over: a manifest that maps
// every image to its route, its component, and the measurements taken on the
// page, and a contact sheet that puts the same set in front of a person.
export default async () => {
  const records = await readRecords()
  const generatedAt = new Date().toISOString()
  // A run that matched no page still owns the folder it was asked to publish.
  await mkdir(outputRoot, { recursive: true })

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        foldHeight: viewport.height,
        generatedAt,
        pages: records,
        personas: audiences.map(({ description, email, name }) => ({ description, email, name })),
        viewport,
      },
      null,
      2,
    )}\n`,
  )

  const sections = audiences.map(({ description, name }) =>
    section(
      name,
      description,
      records.filter((record) => record.persona === name),
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
      img { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 12px; width: 100%; }
      img + img { margin-top: 0.5rem; }
      figcaption { display: flex; flex-direction: column; font-size: 0.8rem; gap: 0.15rem; padding-top: 0.5rem; }
      figcaption span { color: color-mix(in srgb, currentColor 60%, transparent); }
      figcaption strong { font-size: 0.9rem; }
      .finding { color: #b45309; }
      .skipped { color: color-mix(in srgb, currentColor 60%, transparent); font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <h1>Mobile screenshots</h1>
    <p class="generated">
      ${viewport.width} × ${viewport.height} at 2× density, one image per screenful, generated ${new Date(generatedAt).toLocaleString()}.
      Machine-readable index: <a href="manifest.json">manifest.json</a>.
    </p>
${sections.join('\n')}
  </body>
</html>
`,
  )

  const images = records.reduce((total, record) => total + record.images.length, 0)
  console.log(
    `\n📸  ${images} images of ${records.length} pages written to ${relative(process.cwd(), outputRoot)}` +
      `\n    Manifest: ${relative(process.cwd(), manifestPath)}` +
      `\n    Contact sheet: open ${relative(process.cwd(), contactSheetPath)}\n`,
  )
}
