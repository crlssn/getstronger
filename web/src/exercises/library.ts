import type { LibraryExercise } from '@/exercises/types'
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

/** How well a name matches: the start of it, the start of a word in it, or anywhere. */
const rank = (name: string, query: string): number | undefined => {
  const index = fold(name).indexOf(query)
  if (index < 0) return undefined
  if (index === 0) return 0
  return /[^a-z0-9]/.test(fold(name)[index - 1]) ? 1 : 2
}

/** Below this a query matches most of the library, which is no help at all. */
const minimumQuery = 2

/** Whether a query is long enough to be worth fetching the catalogue for. */
export const worthSearching = (query: string): boolean => query.trim().length >= minimumQuery

/**
 * The entries a typed name matches, best first.
 *
 * Both the reader's locale and English are searched, so someone reading
 * Swedish can still type "bench" — and an entry that matches in both is still
 * one suggestion, named the way its reader reads it.
 */
export const searchLibrary = (
  entries: readonly LibraryExercise[],
  query: string,
  locale: AppLocale,
  limit = 6,
): LibraryExercise[] => {
  const wanted = fold(query.trim())
  if (wanted.length < minimumQuery) return []

  return entries
    .flatMap((entry) => {
      const ranks = [rank(libraryName(entry, locale), wanted), rank(entry.names.en, wanted)]
      const best = Math.min(...ranks.map((value) => value ?? Number.POSITIVE_INFINITY))
      return Number.isFinite(best) ? [{ entry, best }] : []
    })
    .sort(
      (a, b) =>
        a.best - b.best ||
        libraryName(a.entry, locale).localeCompare(libraryName(b.entry, locale), locale),
    )
    .slice(0, limit)
    .map(({ entry }) => entry)
}
