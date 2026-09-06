import type { LibraryExercise } from '@/exercises/types'

import { describe, expect, it } from 'vitest'

import { libraryName, loadLibrary, searchLibrary } from '@/exercises/library'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'

const entry = (
  key: string,
  en: string,
  sv?: string,
  tags: LibraryExercise['tags'] = ['chest'],
): LibraryExercise => ({
  key,
  names: sv ? { en, sv } : { en },
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  equipment: ['barbell'],
  tags,
})

const bench = entry('barbell-bench-press', 'Barbell bench press', 'Bänkpress med skivstång')
const benchDip = entry('bench-dip', 'Bench dip', 'Bänkdips')
const squat = entry('barbell-back-squat', 'Barbell back squat', 'Knäböj med skivstång')
const untranslated = entry('sled-push', 'Sled push')
const entries = [bench, benchDip, squat, untranslated]

describe('libraryName', () => {
  it('reads the name in the locale asked for', () => {
    expect(libraryName(bench, 'sv')).toBe('Bänkpress med skivstång')
  })

  it('falls back to English rather than rendering a key', () => {
    expect(libraryName(untranslated, 'sv')).toBe('Sled push')
  })
})

describe('searchLibrary', () => {
  it('matches on the name the reader reads', () => {
    expect(searchLibrary(entries, 'knäböj', 'sv')).toEqual([squat])
  })

  it('folds diacritics, so a plain keyboard still finds a Swedish name', () => {
    expect(searchLibrary(entries, 'knaboj', 'sv')).toEqual([squat])
  })

  it('matches on English too, so a Swedish reader can type bench', () => {
    expect(searchLibrary(entries, 'bench', 'sv')).toEqual([benchDip, bench])
  })

  it('returns an entry matching in both locales exactly once', () => {
    const both = entry('plank', 'Plank', 'Planka')
    expect(searchLibrary([both], 'plan', 'sv')).toEqual([both])
  })

  it('ranks the start of a name above the middle of one', () => {
    expect(searchLibrary(entries, 'barbell', 'en')).toEqual([squat, bench])
  })

  it('finds an untranslated entry by its English name in every locale', () => {
    expect(searchLibrary(entries, 'sled', 'sv')).toEqual([untranslated])
  })

  // The sheet opens on an empty field, and a library with nothing in it is the
  // one thing this is not.
  it('lists the whole library, by name, when nothing is typed', () => {
    expect(searchLibrary(entries, '  ', 'en').map((entry) => entry.names.en)).toEqual([
      'Barbell back squat',
      'Barbell bench press',
      'Bench dip',
      'Sled push',
    ])
  })
})

describe('loadLibrary', () => {
  it('resolves the compiled catalogue', async () => {
    const library = await loadLibrary()
    expect(library.length).toBeGreaterThan(200)
    expect(library.map(({ key }) => key)).toContain('barbell-back-squat')
  })
})
