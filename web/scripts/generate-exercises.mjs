#!/usr/bin/env node
/**
 * Compiles `exercises/*.yaml` into `web/src/exercises/catalogue.ts`.
 *
 * The app never parses YAML: the library is hand-edited and reviewed as YAML,
 * and shipped as one typed module the create-exercise screen imports on
 * demand. Run it with `mise run gen:exercises`.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'
import { parse } from 'yaml'

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const libraryDir = join(webRoot, '..', 'exercises')
const outputPath = join(webRoot, 'src', 'exercises', 'catalogue.ts')

const metricEnumNames = {
  weight: 'WEIGHT',
  reps: 'REPS',
  distance: 'DISTANCE',
  time: 'TIME',
}

const fail = (message) => {
  console.error(`generate-exercises: ${message}`)
  process.exit(1)
}

/** Every YAML file in the library, in the order their names sort. */
const libraryFiles = async (dir = libraryDir) =>
  (await readdir(dir)).filter((name) => name.endsWith('.yaml')).sort()

/** The entries of one file, with the file named in any failure. */
const readLibraryFile = async (file, dir = libraryDir) => {
  const entries = parse(await readFile(join(dir, file), 'utf8'))
  if (!Array.isArray(entries)) fail(`${file} is not a list of exercises`)
  return entries
}

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const renderEntry = (entry, file) => {
  const where = `${file}: ${entry?.key ?? 'an entry with no key'}`
  if (!entry?.key || !entry.names?.en) fail(`${where} is missing a key or an English name`)
  if (!entry.metrics?.length) fail(`${where} declares no metrics`)

  const names = Object.entries(entry.names)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([locale, name]) => `${locale}: ${quote(name)}`)
    .join(', ')

  const metrics = entry.metrics.map((metric) => {
    const name = metricEnumNames[metric]
    if (!name) fail(`${where} measures '${metric}', which the API does not accept`)
    return `ExerciseMetric.${name}`
  })

  const list = (values) => `[${(values ?? []).map(quote).join(', ')}]`

  return [
    '{',
    `key: ${quote(entry.key)},`,
    `names: { ${names} },`,
    `metrics: [${metrics.join(', ')}],`,
    `equipment: ${list(entry.equipment)},`,
    `tags: ${list(entry.tags)},`,
    '},',
  ].join('\n')
}

const generate = async () => {
  const files = await libraryFiles()
  const entries = []
  for (const file of files) {
    for (const entry of await readLibraryFile(file)) entries.push(renderEntry(entry, file))
  }

  const source = [
    '// Generated from exercises/*.yaml by `mise run gen:exercises`. Do not edit.',
    '',
    "import type { LibraryExercise } from '@/exercises/types'",
    '',
    "import { ExerciseMetric } from '@/proto/api/v1/shared_pb'",
    '',
    'export const catalogue: readonly LibraryExercise[] = [',
    entries.join('\n'),
    ']',
    '',
  ].join('\n')

  const formatted = await prettier.format(source, {
    ...(await prettier.resolveConfig(outputPath)),
    filepath: outputPath,
  })
  await writeFile(outputPath, formatted)
  console.log(`generate-exercises: ${entries.length} exercises from ${files.length} files`)
}

await generate()
