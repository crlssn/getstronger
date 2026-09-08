import type { LibraryExercise } from '@/exercises/types'
import type { ExerciseEquipment } from '@/exercises/vocabulary'
import type { AppLocale } from '@/i18n'

/**
 * The catalogue, as its own chunk.
 *
 * A dynamic import rather than a top-level one: two hundred and seventy-five
 * exercises are worth nothing to a reader who never opens the create screen,
 * and the module cache means the second caller pays nothing.
 */
export const loadLibrary = async (): Promise<readonly LibraryExercise[]> =>
  (await import('@/exercises/catalogue')).catalogue

/** The entry's name to read, falling back to English where a locale is missing. */
export const libraryName = (entry: LibraryExercise, locale: AppLocale): string =>
  entry.names[locale] ?? entry.names.en

// Diacritics folded, so 'knaboj' finds 'Knäböj' on a keyboard that makes ä
// hard work.
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** What a gym trains on, most central first. */
const staples: readonly ExerciseEquipment[] = ['barbell', 'dumbbell']

/** What an athlete reaches for when the staple is taken. */
const substitutes: readonly ExerciseEquipment[] = ['band', 'rings', 'suspension-trainer']

/**
 * How well an entry answers a query, as a sort key — lower first.
 *
 * Sorting by where the query landed in the name puts the movements people
 * train under the ones they do not: "Bench dip" beats "Barbell bench press"
 * on a bare prefix, and "Band curl" beats "Barbell curl" on the alphabet. So
 * the key reads how central the entry is before it reads the name:
 *
 * 1. Tier — the staples (barbell, dumbbell, and a bodyweight movement the
 *    query is the name of: pull-up, plank, push-up), then the rest of the
 *    gym floor, then the substitutes (band, rings, straps). The implement is
 *    the first one listed, which is the one the movement is performed with;
 *    an inverted row hangs under a barbell but is a bodyweight movement.
 * 2. A compound movement before an isolation or conditioning one.
 * 3. The query at the start of the name before elsewhere in it. A Swedish
 *    compound noun ends with the movement ("Skivstångsrodd"), so a match
 *    inside a word counts the same as one at the start of a word.
 * 4. Barbell before dumbbell before the rest.
 * 5. The plain movement before its named variants: the fewest words in the
 *    English name that are neither the implement nor what was typed, so
 *    "Barbell bench press" answers "press" ahead of "Behind-the-neck press".
 * 6. The key, which is the same in every locale.
 */
const scoreOf = (entry: LibraryExercise, names: readonly string[], query: string) => {
  const nameStart = names.some((name) => name.startsWith(query))
  const implement = entry.equipment[0]
  const staple = staples.indexOf(implement)
  const tier = substitutes.includes(implement)
    ? 2
    : staple >= 0 || (implement === 'bodyweight' && nameStart)
      ? 0
      : 1
  const implementWords = fold(implement).split('-')
  const qualifiers = fold(entry.names.en)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !implementWords.includes(word) && !query.includes(word))

  return [
    tier,
    entry.tags.includes('compound') ? 0 : 1,
    nameStart ? 0 : 1,
    staple >= 0 ? staple : staples.length,
    qualifiers.length,
  ]
}

const compareScores = (a: readonly number[], b: readonly number[]) =>
  a.reduce((order, value, index) => order || value - b[index], 0)

/**
 * The entries a query matches, best first, and the whole library when nothing
 * is typed.
 *
 * Both the reader's locale and English are searched, so someone reading
 * Swedish can still type "bench" — and an entry that matches in both is still
 * one row, named the way its reader reads it.
 */
export const searchLibrary = (
  entries: readonly LibraryExercise[],
  query: string,
  locale: AppLocale,
): LibraryExercise[] => {
  const wanted = fold(query.trim())
  const byName = (a: LibraryExercise, b: LibraryExercise) =>
    libraryName(a, locale).localeCompare(libraryName(b, locale), locale)

  // An empty field is the sheet's opening state, not a query nothing matches.
  if (!wanted) return [...entries].sort(byName)

  return entries
    .flatMap((entry) => {
      const names = [fold(libraryName(entry, locale)), fold(entry.names.en)]
      if (!names.some((name) => name.includes(wanted))) return []
      return [{ entry, score: scoreOf(entry, names, wanted) }]
    })
    .sort((a, b) => compareScores(a.score, b.score) || a.entry.key.localeCompare(b.entry.key))
    .map(({ entry }) => entry)
}
