import type { ReactNode } from 'react'

import {
  BookOpenIcon,
  FireIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { listExercises, listPlans, listRoutines, searchUsers } from '@/http/requests'
import { cn } from '@/ui/cn'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { handle, initials } from '@/utils/names'
import styles from './HomePageActions.module.css'

const maxResultsPerGroup = 5
const minimumQueryLength = 3
// Long enough that a typed word is one search rather than one per keystroke,
// short enough that the results still feel like they follow the typing.
const searchDebounceMs = 250

interface Result {
  id: string
  to: string
  title: string
  subtitle: string
  avatar: ReactNode
}

interface Group {
  labelKey: string
  results: Result[]
}

const noGroups: Group[] = []

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The search field on the home screen, and the button that opens it. */
export const HomePageActions = ({ open, onOpenChange }: Props) => {
  const { t } = useTranslation()

  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState(noGroups)
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < minimumQueryLength) return

    // The cleanup makes the newest query the only one that can write results,
    // so a slow early request cannot land on top of a fast later one.
    let stale = false

    const timer = setTimeout(() => {
      const search = async () => {
        setSearching(true)

        const [users, routines, plans, exercises] = await Promise.all([
          searchUsers(trimmed, new Uint8Array(0)),
          listRoutines(new Uint8Array(0), trimmed),
          listPlans(),
          listExercises(new Uint8Array(0), trimmed),
        ])
        if (stale) return

        setGroups([
          {
            labelKey: 'search.people',
            results: (users?.users ?? []).map((user) => ({
              id: user.id,
              to: `/users/${user.id}`,
              title: handle(user.username),
              subtitle: user.name,
              avatar: initials(user.name),
            })),
          },
          {
            labelKey: 'search.routines',
            results: (routines?.routines ?? []).slice(0, maxResultsPerGroup).map((routine) => ({
              id: routine.id,
              to: `/routines/${routine.id}`,
              title: routine.name,
              subtitle: t('home.exerciseCount', { count: routine.exercises.length }),
              avatar: <FireIcon aria-hidden="true" />,
            })),
          },
          {
            labelKey: 'search.plans',
            // The plans endpoint takes no query, so the filtering is ours.
            results: (plans?.plans ?? [])
              .filter((plan) => plan.name.toLowerCase().includes(trimmed.toLowerCase()))
              .slice(0, maxResultsPerGroup)
              .map((plan) => ({
                id: plan.id,
                to: `/plans/${plan.id}`,
                title: plan.name,
                subtitle: `${plan.routines.length} ${t('common.routines').toLocaleLowerCase()}`,
                avatar: <RectangleStackIcon aria-hidden="true" />,
              })),
          },
          {
            labelKey: 'search.exercises',
            results: (exercises?.exercises ?? []).slice(0, maxResultsPerGroup).map((exercise) => ({
              id: exercise.id,
              to: `/exercises/${exercise.id}`,
              title: exercise.name,
              subtitle: t('search.viewExercise'),
              avatar: <BookOpenIcon aria-hidden="true" />,
            })),
          },
        ])
        setSearching(false)
        setHasSearched(true)
      }

      void search()
    }, searchDebounceMs)

    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [trimmed, t])

  const clear = () => {
    setGroups(noGroups)
    setSearching(false)
    setHasSearched(false)
  }

  const onQueryChange = (value: string) => {
    setQuery(value)
    // Too short to search, so nothing on screen should still claim to be a
    // result for it.
    if (value.trim().length < minimumQueryLength) clear()
  }

  const closeSearch = () => {
    setQuery('')
    clear()
    onOpenChange(false)
  }

  const found = groups.filter((group) => group.results.length > 0)

  return (
    <div className={cn(styles.homeActions, open && styles.searching)}>
      {!open && (
        <button
          type="button"
          className={styles.searchTrigger}
          aria-label={t('search.open')}
          onClick={() => onOpenChange(true)}
        >
          <MagnifyingGlassIcon aria-hidden="true" />
        </button>
      )}

      {open && (
        <section className={styles.searchPanel} aria-label={t('search.open')}>
          <AppSearchField
            // The field mounts with the panel, so opening search from anywhere
            // on the page lands the cursor in it.
            inputRef={focusOnMount}
            size="lg"
            label={t('search.placeholder')}
            value={query}
            onChange={onQueryChange}
            onKeyDown={(event) => event.key === 'Escape' && closeSearch()}
            trailing={
              <AppIconButton
                className="-mr-2"
                label={t('search.close')}
                icon={XMarkIcon}
                onClick={closeSearch}
              />
            }
          />

          {found.length > 0 ? (
            <div className={styles.searchResults}>
              {/* Fragments, not wrappers: the rows are styled as siblings, so
                  a per-group element would move the last row's border. */}
              {found.map((group) => (
                <Fragment key={group.labelKey}>
                  <p className={styles.groupLabel}>{t(group.labelKey)}</p>
                  {group.results.map((result) => (
                    <Link key={result.id} to={result.to} onClick={closeSearch}>
                      <span className={styles.avatar}>{result.avatar}</span>
                      <span>
                        <strong>{result.title}</strong>
                        <small>{result.subtitle}</small>
                      </span>
                    </Link>
                  ))}
                </Fragment>
              ))}
            </div>
          ) : searching ? (
            <p className={styles.searchHint} aria-live="polite">
              {t('search.searching')}
            </p>
          ) : (
            <p className={styles.searchHint}>
              {hasSearched ? t('search.nothingFound', { query }) : t('search.hint')}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

const focusOnMount = (node: HTMLInputElement | null) => node?.focus()
