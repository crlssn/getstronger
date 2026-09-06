import type { LibraryExercise } from '@/exercises/types'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { libraryName, loadLibrary, searchLibrary, worthSearching } from '@/exercises/library'
import { resolveLocale } from '@/i18n'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import styles from './ExerciseLibrarySuggestions.module.css'

interface Props {
  /** What has been typed into the name field so far. */
  query: string
  onPick: (entry: LibraryExercise) => void
}

/**
 * The library entries a typed name matches, offered under the name field.
 *
 * The catalogue is fetched the first time there is enough typed to search,
 * never on the way into the screen. A reader who is offline, or who is naming
 * something the library has never heard of, sees nothing and types on.
 */
export const ExerciseLibrarySuggestions = ({ query, onPick }: Props) => {
  const { t, i18n } = useTranslation()
  const locale = resolveLocale([i18n.language])
  const [library, setLibrary] = useState<readonly LibraryExercise[]>([])
  const searching = worthSearching(query)

  useEffect(() => {
    if (!searching) return

    let cancelled = false
    const load = async () => {
      // A chunk that never arrives costs the screen its suggestions, not its
      // form: an exercise the library does not have is still typed by hand.
      const entries = await loadLibrary().catch(() => [])
      if (!cancelled) setLibrary(entries)
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [searching])

  const matches = searchLibrary(library, query, locale)
  if (!matches.length) return null

  return (
    <section className={styles.suggestions}>
      <h2 className={styles.heading}>{t('exercise.library.heading')}</h2>
      <p className={styles.help}>{t('exercise.library.help')}</p>

      <div className={styles.options}>
        {matches.map((entry) => (
          <AppOptionRow
            key={entry.key}
            trailing={<PlusIcon aria-hidden="true" />}
            onClick={() => onPick(entry)}
          >
            <strong>{libraryName(entry, locale)}</strong>
            <ExerciseTags compact tags={entry.tags} />
          </AppOptionRow>
        ))}
      </div>
    </section>
  )
}
