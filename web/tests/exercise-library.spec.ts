import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { catalogue } from '@/exercises/catalogue'
import { localeNames } from '@/i18n'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import {
  exerciseEquipment,
  exerciseGroups,
  exerciseMetricNames,
  exerciseTags,
  maxLibraryTags,
  muscleTags,
  patternTags,
  qualityTags,
} from '@/exercises/vocabulary'

const libraryDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'exercises')

interface RawEntry {
  key?: unknown
  names?: Record<string, unknown>
  metrics?: unknown[]
  equipment?: unknown[]
  tags?: unknown[]
}

const files = readdirSync(libraryDir)
  .filter((name) => name.endsWith('.yaml'))
  .sort()

const entriesByFile = new Map<string, RawEntry[]>(
  files.map((file) => [file, parse(readFileSync(join(libraryDir, file), 'utf8')) as RawEntry[]]),
)

const allEntries = [...entriesByFile].flatMap(([file, entries]) =>
  entries.map((entry) => ({ file, entry })),
)

/** Every `token` opening a list item under a heading of the README. */
const readmeVocabulary = (heading: string): string[] => {
  const readme = readFileSync(join(libraryDir, 'README.md'), 'utf8')
  const section = readme.split(`### ${heading}\n`)[1]?.split('\n## ')[0].split('\n### ')[0]
  expect(section, `README.md has no '### ${heading}' section`).toBeDefined()
  return [...(section ?? '').matchAll(/^- `([a-z0-9-]+)`/gm)].map((match) => match[1])
}

describe('the library is written against the documented vocabulary', () => {
  it.each([
    ['Group tags', exerciseGroups],
    ['Muscle tags', muscleTags],
    ['Pattern tags', patternTags],
    ['Quality tags', qualityTags],
    ['Equipment', exerciseEquipment],
  ])('README.md lists the same %s as vocabulary.ts', (heading, expected) => {
    expect(readmeVocabulary(heading)).toEqual([...expected])
  })

  it('names one file per group, and no group without a file', () => {
    expect(files).toEqual(exerciseGroups.map((group) => `${group}.yaml`))
  })
})

/**
 * The names the library capitalises mid-sentence, because they are somebody's.
 */
const properNouns = [
  'Arnold',
  'Bulgarian',
  'Copenhagen',
  'Cuban',
  'Jefferson',
  'Nordic',
  'Pallof',
  'Pendlay',
  'Romanian',
  'Russian',
  'Svend',
  'Turkish',
  'Zercher',
  'Zottman',
]

const sentenceCase = (name: string) =>
  properNouns.reduce((value, noun) => value.replaceAll(noun, noun.toLowerCase()), name)

describe('every entry', () => {
  it('is a list of entries in every file', () => {
    for (const [file, entries] of entriesByFile) {
      expect(Array.isArray(entries), `${file} is not a list`).toBe(true)
      expect(entries.length, `${file} is empty`).toBeGreaterThan(0)
    }
  })

  it('declares a stable, unique key', () => {
    const seen = new Set<string>()
    for (const { file, entry } of allEntries) {
      expect(entry.key, `${file} has an entry with no key`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(seen.has(entry.key as string), `${entry.key as string} is declared twice`).toBe(false)
      seen.add(entry.key as string)
    }
  })

  it('declares an English name, in sentence case and unique across the library', () => {
    const seen = new Set<string>()
    for (const { file, entry } of allEntries) {
      const name = entry.names?.en
      expect(typeof name, `${file}: ${String(entry.key)} has no English name`).toBe('string')
      expect(name as string).not.toBe('')
      // 'Barbell back squat', never 'Barbell Back Squat': a name is data, and
      // the app renders it as written. Proper nouns are the exception, and
      // listing them is how the library says which ones it has earned.
      expect(sentenceCase(name as string), `${name as string} is Title Cased`).not.toMatch(/ [A-Z]/)
      expect(seen.has((name as string).toLowerCase()), `${name as string} is declared twice`).toBe(
        false,
      )
      seen.add((name as string).toLowerCase())
    }
  })

  // A fourth language is a key under `names` and nothing else: the app's own
  // list of locales is what this checks against, so nothing here changes.
  it('declares only locales the app speaks, with nothing blank', () => {
    const spoken = Object.keys(localeNames)
    for (const { file, entry } of allEntries) {
      for (const [locale, name] of Object.entries(entry.names ?? {})) {
        expect(spoken, `${file}: ${String(entry.key)} names a locale '${locale}'`).toContain(locale)
        expect(typeof name).toBe('string')
        expect((name as string).trim()).not.toBe('')
      }
    }
  })

  it('declares at least one metric, and only metrics the API accepts', () => {
    for (const { file, entry } of allEntries) {
      const metrics = entry.metrics ?? []
      expect(metrics.length, `${file}: ${String(entry.key)} measures nothing`).toBeGreaterThan(0)
      expect(new Set(metrics).size, `${String(entry.key)} repeats a metric`).toBe(metrics.length)
      for (const metric of metrics) {
        expect(exerciseMetricNames, `${String(entry.key)} measures '${String(metric)}'`).toContain(
          metric,
        )
      }
    }
  })

  it('declares equipment from the vocabulary', () => {
    for (const { entry } of allEntries) {
      const equipment = entry.equipment ?? []
      expect(equipment.length, `${String(entry.key)} names no equipment`).toBeGreaterThan(0)
      expect(new Set(equipment).size, `${String(entry.key)} repeats equipment`).toBe(
        equipment.length,
      )
      for (const item of equipment) {
        expect(exerciseEquipment, `${String(entry.key)} uses '${String(item)}'`).toContain(item)
      }
    }
  })

  it('carries the group tag of its file and no more than the API allows', () => {
    for (const { file, entry } of allEntries) {
      const tags = (entry.tags ?? []) as string[]
      expect(tags.length, `${String(entry.key)} carries too many tags`).toBeLessThanOrEqual(
        maxLibraryTags,
      )
      expect(tags.length, `${String(entry.key)} says nothing but its group`).toBeGreaterThan(1)
      expect(new Set(tags).size, `${String(entry.key)} repeats a tag`).toBe(tags.length)
      for (const tag of tags) {
        expect(exerciseTags, `${String(entry.key)} is tagged '${tag}'`).toContain(tag)
      }
      // The leading tag is the file's, and a second group tag after it is a
      // movement that genuinely trains two regions — a squat says 'glutes'.
      expect(tags[0], `${String(entry.key)} belongs to ${file}`).toBe(file.replace('.yaml', ''))
    }
  })

  it('is translated into Swedish', () => {
    const untranslated = allEntries
      .filter(({ entry }) => !entry.names?.sv)
      .map(({ entry }) => String(entry.key))
    expect(untranslated).toEqual([])
  })
})

describe('coverage', () => {
  const has = (predicate: (entry: RawEntry) => boolean) =>
    allEntries.some(({ entry }) => predicate(entry))

  const tagged = (entry: RawEntry, tag: string) => ((entry.tags ?? []) as string[]).includes(tag)
  const uses = (entry: RawEntry, item: string) =>
    ((entry.equipment ?? []) as string[]).includes(item)

  // Every movement pattern across every implement the combination is real on.
  // A blank is a claim too: a vertical pull with a barbell is a pull-up on a
  // bar, filed under bodyweight.
  const matrix: Record<string, string[]> = {
    squat: ['barbell', 'dumbbell', 'kettlebell', 'machine', 'bodyweight'],
    hinge: ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'band', 'bodyweight'],
    lunge: ['barbell', 'dumbbell', 'kettlebell', 'bodyweight'],
    'horizontal-push': [
      'barbell',
      'dumbbell',
      'kettlebell',
      'cable',
      'machine',
      'band',
      'bodyweight',
    ],
    'vertical-push': [
      'barbell',
      'dumbbell',
      'kettlebell',
      'cable',
      'machine',
      'band',
      'bodyweight',
    ],
    'horizontal-pull': [
      'barbell',
      'dumbbell',
      'kettlebell',
      'cable',
      'machine',
      'band',
      'bodyweight',
    ],
    'vertical-pull': ['cable', 'machine', 'band', 'bodyweight'],
    carry: ['barbell', 'dumbbell', 'kettlebell'],
  }

  it.each(Object.entries(matrix))(
    'covers %s on every implement it is real on',
    (pattern, items) => {
      const missing = items.filter(
        (item) => !has((entry) => tagged(entry, pattern) && uses(entry, item)),
      )
      expect(missing).toEqual([])
    },
  )

  it.each([
    ['core', ['bodyweight', 'cable', 'machine', 'band', 'dumbbell', 'ab-wheel']],
    ['cardio', ['bodyweight', 'treadmill', 'rower', 'stationary-bike', 'jump-rope', 'ski-erg']],
  ])('covers %s on every implement it is real on', (group, items) => {
    const missing = items.filter(
      (item) => !has((entry) => tagged(entry, group) && uses(entry, item)),
    )
    expect(missing).toEqual([])
  })

  // A floor rather than a target: a group thinner than this has a gap someone
  // will hit on their first session.
  // A term nothing uses is a term nobody agreed on. Dead vocabulary is either
  // an entry that was never written or a word that should be deleted.
  it.each([
    ['tag', exerciseTags, (entry: RawEntry) => (entry.tags ?? []) as string[]],
    ['equipment', exerciseEquipment, (entry: RawEntry) => (entry.equipment ?? []) as string[]],
  ])('uses every %s in the vocabulary', (_kind, vocabulary, read) => {
    const used = new Set(allEntries.flatMap(({ entry }) => read(entry)))
    expect([...vocabulary].filter((term) => !used.has(term))).toEqual([])
  })

  it.each([
    ['arms.yaml', 30],
    ['back.yaml', 30],
    ['cardio.yaml', 15],
    ['chest.yaml', 25],
    ['core.yaml', 25],
    ['full-body.yaml', 20],
    ['glutes.yaml', 20],
    ['legs.yaml', 35],
    ['shoulders.yaml', 25],
  ])('gives %s at least %i entries', (file, floor) => {
    expect(entriesByFile.get(file)?.length ?? 0).toBeGreaterThanOrEqual(floor)
  })
})

describe('the compiled catalogue', () => {
  const metricValues: Record<string, ExerciseMetric> = {
    weight: ExerciseMetric.WEIGHT,
    reps: ExerciseMetric.REPS,
    distance: ExerciseMetric.DISTANCE,
    time: ExerciseMetric.TIME,
  }

  it('is what the YAML says, in the order the files sort', () => {
    expect(catalogue).toEqual(
      allEntries.map(({ entry }) => ({
        key: entry.key,
        names: entry.names,
        metrics: (entry.metrics as string[]).map((metric) => metricValues[metric]),
        equipment: entry.equipment,
        tags: entry.tags,
      })),
    )
  })
})
