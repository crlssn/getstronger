#!/usr/bin/env node
/**
 * Compiles `exercises/` into the web app's typed exercise library.
 *
 * The app never parses YAML: the library is hand-edited and reviewed as YAML,
 * and shipped as two generated modules the create-exercise screen imports.
 * Run it with `mise run gen:exercises`.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'
import { parse } from 'yaml'

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const libraryDir = join(webRoot, '..', 'exercises')
const outputDir = join(webRoot, 'src', 'exercises')

/** The one file in the library that holds vocabulary rather than movements. */
const vocabularyFile = 'vocabulary.yaml'

// The names YAML writes a metric with, and the enum member each compiles to.
// This map is the only place the two vocabularies meet.
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

const readYaml = async (file) => parse(await readFile(join(libraryDir, file), 'utf8'))

/** Every file of movements, in the order their names sort. */
const movementFiles = async () =>
  (await readdir(libraryDir))
    .filter((name) => name.endsWith('.yaml') && name !== vocabularyFile)
    .sort()

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const renderList = (values) => `[${(values ?? []).map(quote).join(', ')}]`

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

  return [
    '{',
    `key: ${quote(entry.key)},`,
    `names: { ${names} },`,
    `metrics: [${metrics.join(', ')}],`,
    `equipment: ${renderList(entry.equipment)},`,
    `tags: ${renderList(entry.tags)},`,
    '},',
  ].join('\n')
}

const header = (source) =>
  `// Generated from exercises/${source} by \`mise run gen:exercises\`. Do not edit.`

const write = async (name, source) => {
  const path = join(outputDir, name)
  const formatted = await prettier.format(source, {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  })
  await writeFile(path, formatted)
}

const generateVocabulary = async () => {
  const vocabulary = await readYaml(vocabularyFile)
  const missing = ['groups', 'muscles', 'patterns', 'qualities', 'equipment'].filter(
    (key) => !vocabulary?.[key],
  )
  if (missing.length) fail(`${vocabularyFile} declares no ${missing.join(', ')}`)

  const constant = (name, doc, values) =>
    `\n/** ${doc} */\nexport const ${name} = ${renderList(values)} as const\n`

  await write(
    'vocabulary.ts',
    [
      header(vocabularyFile),
      '',
      constant(
        'exerciseGroups',
        'The muscle group an entry belongs to: one per file, and every entry leads with it.',
        Object.keys(vocabulary.groups),
      ),
      constant('muscleTags', 'What the movement trains, finer than the group.', vocabulary.muscles),
      constant(
        'patternTags',
        "The movement pattern, which is how the library's coverage is measured.",
        vocabulary.patterns,
      ),
      constant(
        'qualityTags',
        'How the movement is trained, where that changes what it is for.',
        vocabulary.qualities,
      ),
      '',
      '/** Every tag an entry may carry. */',
      'export const exerciseTags = [',
      '...exerciseGroups,',
      '...muscleTags,',
      '...patternTags,',
      '...qualityTags,',
      '] as const',
      '',
      'export type ExerciseTag = (typeof exerciseTags)[number]',
      constant(
        'exerciseEquipment',
        'What the movement is performed with. Read by nothing outside the library yet.',
        vocabulary.equipment,
      ),
      'export type ExerciseEquipment = (typeof exerciseEquipment)[number]',
      constant(
        'exerciseMetricNames',
        'The metric names YAML writes, each of which compiles to an ExerciseMetric.',
        Object.keys(metricEnumNames),
      ),
    ].join('\n'),
  )

  return Object.keys(vocabulary.groups).length
}

const generateCatalogue = async () => {
  const files = await movementFiles()
  const entries = []
  for (const file of files) {
    const movements = await readYaml(file)
    if (!Array.isArray(movements)) fail(`${file} is not a list of exercises`)
    for (const entry of movements) entries.push(renderEntry(entry, file))
  }

  await write(
    'catalogue.ts',
    [
      header('*.yaml'),
      '',
      "import type { LibraryExercise } from '@/exercises/types'",
      '',
      "import { ExerciseMetric } from '@/proto/api/v1/shared_pb'",
      '',
      'export const catalogue: readonly LibraryExercise[] = [',
      entries.join('\n'),
      ']',
      '',
    ].join('\n'),
  )

  return { entries: entries.length, files: files.length }
}

const groups = await generateVocabulary()
const { entries, files } = await generateCatalogue()
console.log(`generate-exercises: ${entries} exercises from ${files} files, ${groups} groups`)
