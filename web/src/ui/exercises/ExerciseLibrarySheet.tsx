import type { LibraryExercise } from '@/exercises/types'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { libraryName, loadLibrary, searchLibrary } from '@/exercises/library'
import { resolveLocale } from '@/i18n'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import styles from './ExerciseLibrarySheet.module.css'

interface Props {
  onPick: (entry: LibraryExercise) => void
  onClose: () => void
}

/**
 * The exercise library, picked from rather than typed out.
 *
 * The catalogue is fetched when the sheet opens and never on the way into the
 * screen, so a reader who types their own name pays nothing for it. Searching
 * reads the name in the reader's locale and the English one at once, which is
 * what lets someone reading Swedish type "bench".
 */
export const ExerciseLibrarySheet = ({ onPick, onClose }: Props) => {
  const { t, i18n } = useTranslation()
  const locale = resolveLocale([i18n.language])

  const [library, setLibrary] = useState<readonly LibraryExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  // Bumped to ask for the chunk again after a failure; the import itself is
  // cached once it succeeds, so a retry costs nothing when it was only slow.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Offline, the chunk may never arrive. The sheet says so rather than
      // reading as a library with nothing in it.
      const entries = await loadLibrary().catch(() => undefined)
      if (cancelled) return
      if (entries) setLibrary(entries)
      else setFailed(true)
      setLoading(false)
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [attempt])

  const matches = searchLibrary(library, search, locale)

  return (
    <AppSheet
      title={t('exercise.library.title')}
      body={t('exercise.library.help')}
      closeLabel={t('exercise.library.close')}
      onClose={onClose}
    >
      <AppSearchField
        className={styles.search}
        label={t('exercise.library.search')}
        value={search}
        onChange={setSearch}
      />

      {loading ? (
        <AppSkeleton />
      ) : failed ? (
        <AppErrorState
          onRetry={() => {
            setFailed(false)
            setLoading(true)
            setAttempt((count) => count + 1)
          }}
        />
      ) : matches.length ? (
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
      ) : (
        <div className={styles.empty}>{t('exercise.noMatches')}</div>
      )}
    </AppSheet>
  )
}
