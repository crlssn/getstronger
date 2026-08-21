import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { compare } from './budget'
import { authenticatedPages, guestPages, personas, type PageEntry } from './catalogue'
import { flowRecords } from './flows'
import { changesSince } from './diff'
import {
  changesRoot,
  contactSheetPath,
  manifestPath,
  outputRoot,
  recordsPath,
  viewport,
  type Change,
  type Findings,
  type PageRecord,
} from './paths'

// Ordering only needs each page's name, and a flow step has no route of its own.
type Audience = {
  description: string
  email?: string
  name: string
  pages: (PageEntry | { name: string })[]
}

const audiences: Audience[] = [
  { description: 'Pages a signed-out visitor sees', name: 'guest', pages: guestPages },
  ...personas.map((persona) => ({
    description: persona.description,
    email: persona.email,
    name: persona.name,
    pages: [...authenticatedPages, ...flowRecords],
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

const changeLines = (changes: Change[] | undefined) =>
  (changes ?? []).map((change) =>
    [change.kind, change.image.split('/').pop(), change.detail].filter(Boolean).join(' — '),
  )

const figure = (record: PageRecord) => `<figure${record.changes ? ' class="changed"' : ''}>
          ${record.images
            .map(
              (image) =>
                `<a href="${image}"><img src="${image}" alt="${escapeHtml(image)}" loading="lazy" /></a>`,
            )
            .join('\n          ')}
          ${(record.changes ?? [])
            .filter((change) => change.diff !== undefined)
            .map(
              (change) =>
                `<a href="${change.diff}"><img class="diff" src="${change.diff}" alt="${escapeHtml(change.image)} diff" loading="lazy" /></a>`,
            )
            .join('\n          ')}
          <figcaption>
            <strong>${escapeHtml(record.name)}</strong>
            <span>${escapeHtml(record.route ?? record.reason ?? '')}</span>
            <span>${escapeHtml(record.component)}</span>
            ${changeLines(record.changes)
              .map((line) => `<span class="change">${escapeHtml(line)}</span>`)
              .join('\n            ')}
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

  const changes = process.env.SCREENSHOT_DIFF
    ? await changesSince(records.flatMap((record) => record.images))
    : undefined

  for (const record of records) {
    const own = (changes ?? []).filter((change) => record.images.includes(change.image))
    if (own.length > 0) record.changes = own
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        changes,
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
      .change { color: #047857; }
      .changed { outline: 2px solid #047857; border-radius: 14px; outline-offset: 0.75rem; }
      .diff { background: #000; }
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
  const moved = records.filter((record) => record.changes !== undefined)
  const comparison =
    changes === undefined
      ? ''
      : moved.length === 0 && changes.length === 0
        ? '\n    Nothing moved since the previous run.'
        : `\n    Changed since the previous run: ${
            moved.map((record) => `${record.persona}/${record.name}`).join(', ') || 'none'
          }` + `\n    Highlighted differences: ${relative(process.cwd(), changesRoot)}`

  console.log(
    `\n📸  ${images} images of ${records.length} pages written to ${relative(process.cwd(), outputRoot)}` +
      `\n    Manifest: ${relative(process.cwd(), manifestPath)}` +
      `\n    Contact sheet: open ${relative(process.cwd(), contactSheetPath)}` +
      `${comparison}\n`,
  )

  const { improved, lines, regressed } = await compare(records)
  console.log(`📐  Findings against the budget\n${lines.map((line) => `    ${line}`).join('\n')}\n`)

  if (improved.length > 0) {
    console.log(
      `✅  Below budget on ${improved.join(', ')}. Lower it in tests/screenshots/budget.json to hold the gain.\n`,
    )
  }

  if (regressed.length > 0) {
    // Without this the numbers drift back up one screen at a time, and the run
    // above was the last time they were ever this low.
    console.error(
      `❌  Over budget on ${regressed.join(', ')}.` +
        ` Fix the finding, or raise tests/screenshots/budget.json deliberately and say why.\n`,
    )
    process.exitCode = 1
  }
}
