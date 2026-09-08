import type { AppLocale } from '@/i18n'
import type { LibraryExercise } from '@/exercises/types'

import { beforeAll, describe, expect, it } from 'vitest'

import { libraryName, loadLibrary, searchLibrary } from '@/exercises/library'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'

const entry = (
  key: string,
  en: string,
  sv?: string,
  equipment: LibraryExercise['equipment'] = ['barbell'],
  tags: LibraryExercise['tags'] = ['chest', 'compound'],
): LibraryExercise => ({
  key,
  names: sv ? { en, sv } : { en },
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  equipment,
  tags,
})

const bench = entry('barbell-bench-press', 'Barbell bench press', 'Bänkpress med skivstång')
const benchDip = entry('bench-dip', 'Bench dip', 'Bänkdips', ['bodyweight', 'bench'], ['arms'])
const squat = entry('barbell-back-squat', 'Barbell back squat', 'Knäböj med skivstång')
const untranslated = entry('sled-push', 'Sled push', undefined, ['sled'], ['full-body'])
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
    expect(searchLibrary(entries, 'bench', 'sv')).toEqual([bench, benchDip])
  })

  it('returns an entry matching in both locales exactly once', () => {
    const both = entry('plank', 'Plank', 'Planka')
    expect(searchLibrary([both], 'plan', 'sv')).toEqual([both])
  })

  it('breaks a full tie on the key, which is the same in every locale', () => {
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

  describe('ranking', () => {
    const barbellRow = entry(
      'barbell-row',
      'Barbell row',
      'Skivstångsrodd',
      ['barbell'],
      ['back', 'compound'],
    )
    const dumbbellRow = entry(
      'dumbbell-row',
      'Dumbbell row',
      'Hantelrodd',
      ['dumbbell'],
      ['back', 'compound'],
    )
    const rower = entry(
      'rowing-machine',
      'Rowing machine',
      'Rodd i roddmaskin',
      ['rower'],
      ['cardio'],
    )
    const bandRow = entry(
      'band-seated-row',
      'Band seated row',
      'Sittande rodd med gummiband',
      ['band'],
      ['back'],
    )
    const invertedRow = entry(
      'inverted-row',
      'Inverted row',
      'Omvänd rodd',
      ['bodyweight', 'barbell'],
      ['back', 'compound'],
    )
    const pullUp = entry(
      'pull-up',
      'Pull-up',
      'Chins',
      ['bodyweight', 'pull-up-bar'],
      ['back', 'compound'],
    )
    const rackPull = entry(
      'rack-pull',
      'Rack pull',
      'Rack pull',
      ['barbell', 'squat-rack'],
      ['back', 'compound'],
    )
    const barbellCurl = entry(
      'barbell-curl',
      'Barbell curl',
      'Bicepscurl med skivstång',
      ['barbell'],
      ['arms', 'isolation'],
    )
    const nordicCurl = entry(
      'nordic-hamstring-curl',
      'Nordic hamstring curl',
      'Nordisk hamstringcurl',
      ['bodyweight'],
      ['legs', 'compound'],
    )

    it('puts a barbell before a dumbbell, and both before the rest of the gym floor', () => {
      expect(searchLibrary([rower, dumbbellRow, barbellRow], 'row', 'en')).toEqual([
        barbellRow,
        dumbbellRow,
        rower,
      ])
    })

    it('puts a band last, whatever its name', () => {
      expect(searchLibrary([bandRow, rower], 'row', 'en')).toEqual([rower, bandRow])
    })

    it('reads an entry by the implement it leads with, not every one it lists', () => {
      expect(searchLibrary([invertedRow, dumbbellRow], 'row', 'en')).toEqual([
        dumbbellRow,
        invertedRow,
      ])
    })

    it('counts a bodyweight movement named by the query as a staple', () => {
      expect(searchLibrary([rackPull, pullUp], 'pull', 'en')).toEqual([pullUp, rackPull])
    })

    it('but not one the query merely occurs in', () => {
      expect(searchLibrary([nordicCurl, barbellCurl], 'curl', 'en')).toEqual([
        barbellCurl,
        nordicCurl,
      ])
    })

    it('puts a compound movement before an isolation one at the same tier', () => {
      expect(searchLibrary([benchDip, bench], 'bench', 'en')).toEqual([bench, benchDip])
    })

    it('puts the plain movement before its named variant, whatever the alphabet says', () => {
      const neck = entry('barbell-behind-the-neck-press', 'Behind-the-neck press', 'Nackpress')
      expect(searchLibrary([neck, bench], 'press', 'en')).toEqual([bench, neck])
    })

    // A Swedish compound noun ends with the movement, so where in the word the
    // query lands says nothing about how central the entry is.
    it('does not hold a match inside a word against a Swedish name', () => {
      expect(searchLibrary([invertedRow, barbellRow], 'rodd', 'sv')).toEqual([
        barbellRow,
        invertedRow,
      ])
    })
  })
})

describe('loadLibrary', () => {
  it('resolves the compiled catalogue', async () => {
    const library = await loadLibrary()
    expect(library.length).toBeGreaterThan(200)
    expect(library.map(({ key }) => key)).toContain('barbell-back-squat')
  })
})

// The six slots the create screen shows are the whole of the feature's
// usefulness, so the first answer to what an athlete actually types is pinned
// here: a later change to the scoring has to say what it moved.
describe('searchLibrary over the catalogue', () => {
  let library: readonly LibraryExercise[] = []

  beforeAll(async () => {
    library = await loadLibrary()
  })

  const keys = (query: string, locale: AppLocale) =>
    searchLibrary(library, query, locale).map(({ key }) => key)

  it.each<[string, AppLocale, string]>([
    ['bench', 'en', 'barbell-bench-press'],
    ['row', 'en', 'barbell-row'],
    ['press', 'en', 'barbell-bench-press'],
    ['curl', 'en', 'barbell-curl'],
    ['squat', 'en', 'barbell-back-squat'],
    ['deadlift', 'en', 'barbell-deadlift'],
    ['pull', 'en', 'pull-up'],
    ['plank', 'en', 'plank'],
    // A Swedish reader typing the Swedish name.
    ['bänk', 'sv', 'barbell-bench-press'],
    ['rodd', 'sv', 'barbell-row'],
    ['press', 'sv', 'barbell-bench-press'],
    ['curl', 'sv', 'barbell-curl'],
    ['knäböj', 'sv', 'barbell-back-squat'],
    ['marklyft', 'sv', 'barbell-deadlift'],
    ['planka', 'sv', 'plank'],
    // A Swedish reader typing the English one.
    ['bench', 'sv', 'barbell-bench-press'],
    ['row', 'sv', 'barbell-row'],
    ['press', 'sv', 'barbell-bench-press'],
    ['curl', 'sv', 'barbell-curl'],
    ['squat', 'sv', 'barbell-back-squat'],
    ['deadlift', 'sv', 'barbell-deadlift'],
    ['pull', 'sv', 'pull-up'],
    ['plank', 'sv', 'plank'],
  ])('offers %s first to a reader in %s: %s', (query, locale, first) => {
    expect(keys(query, locale)[0]).toBe(first)
  })

  it.each<[string, AppLocale]>([
    ['row', 'en'],
    ['rodd', 'sv'],
  ])('offers %s (%s) as a barbell row before the erg and the band rows', (query, locale) => {
    const ranked = keys(query, locale)
    const barbellRow = ranked.indexOf('barbell-row')
    expect(barbellRow).toBeLessThan(ranked.indexOf('rowing-machine'))
    expect(barbellRow).toBeLessThan(ranked.indexOf('band-seated-row'))
    expect(barbellRow).toBeLessThan(ranked.indexOf('band-bent-over-row'))
  })

  it.each<[string, AppLocale]>([
    ['press', 'en'],
    ['press', 'sv'],
  ])('offers %s (%s) a barbell or dumbbell press in the first two slots', (query, locale) => {
    const [first, second] = keys(query, locale)
    expect([first, second].some((key) => /^(barbell|dumbbell)-/.test(key))).toBe(true)
  })
})
