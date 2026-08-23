import type { DropdownItem } from '@/types/dropdown'
import type { DraftGroup, GroupMode } from '@/utils/routineGroups'

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppNumberField } from '@/ui/components/AppNumberField'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { DropdownButton } from '@/ui/components/DropdownButton'
import {
  addGroup,
  defaultRoundRestSeconds,
  groupHasExercise,
  groupLetter,
  maximumRestSeconds,
  moveEntryToGroup,
  moveEntryWithinGroup,
  removeEntry,
  removeGroup,
  setEntryRest,
} from '@/utils/routineGroups'
import styles from './RoutineGroupsEditor.module.css'

interface Props {
  groups: DraftGroup[]
  /** Whether the groups are shown as groups, or as the one block a plain routine is. */
  grouped: boolean
  /** Names come from the routine and from the picker, so nothing is fetched here. */
  nameOf: (exerciseId: string) => string
  /** The rest the exercise library says this exercise takes, which is what an
   * empty per-exercise field falls back to. */
  libraryRestOf: (exerciseId: string) => number
  onChange: (groups: DraftGroup[]) => void
  onAddExercise: (groupId: string) => void
}

/** A rest the API will take: seconds, never negative, never past an hour. */
const clampRest = (seconds: number | undefined) =>
  Math.min(Math.max(Math.round(seconds ?? 0), 0), maximumRestSeconds)

const withGroup = (groups: DraftGroup[], groupId: string, changes: Partial<DraftGroup>) =>
  groups.map((group) => (group.id === groupId ? { ...group, ...changes } : group))

const setMode = (groups: DraftGroup[], groupId: string, mode: GroupMode) => {
  const group = groups.find((entry) => entry.id === groupId)
  if (mode !== 'circuit') return withGroup(groups, groupId, { mode })

  // A circuit that has never been set up still arrives ready to run, with the
  // rest that belongs to the round rather than to the set.
  return withGroup(groups, groupId, {
    mode,
    restBetweenRoundsSeconds: group?.restBetweenRoundsSeconds || defaultRoundRestSeconds,
  })
}

/**
 * The exercises of a routine, in the blocks that train them.
 *
 * A group is a card of the page, not a box inside another box. On a phone the
 * exercise name is the first thing to lose room, and every border it sits
 * inside takes some of it — so nothing here is boxed, only ruled. Where an
 * exercise goes next is the row's menu, which can say "Move to group B" where a
 * select could only name it.
 */
export const RoutineGroupsEditor = ({
  groups,
  grouped,
  nameOf,
  libraryRestOf,
  onChange,
  onAddExercise,
}: Props) => {
  const { t } = useTranslation()

  const entryActions = (
    key: string,
    groupId: string,
    exerciseId: string,
    name: string,
  ): DropdownItem[] => [
    // Only the groups that could take it: one group trains an exercise once.
    ...groups
      .map((group, index) => ({ group, letter: groupLetter(index) }))
      .filter(({ group }) => group.id !== groupId && !groupHasExercise(group, exerciseId))
      .map(({ group, letter }) => ({
        func: async () => onChange(moveEntryToGroup(groups, key, group.id)),
        title: t('routine.form.groups.moveToGroup', { letter }),
      })),
    {
      destructive: true,
      func: async () => onChange(removeEntry(groups, key)),
      title: t('routine.form.groups.removeExercise', { name }),
    },
  ]

  return (
    <>
      {groups.map((group, index) => {
        const letter = groupLetter(index)
        const circuit = group.mode === 'circuit'

        return (
          <section key={group.id} className={cn(styles.group, circuit && styles.circuit)}>
            {/* Only a group is named on the card. The plain block a routine
                starts as is the "Exercises" label above it. */}
            {grouped && (
              <header className={styles.groupHeader}>
                <span className={styles.groupBadge} aria-hidden="true">
                  {letter}
                </span>
                <div className={styles.groupTitle}>
                  <strong>{t('routine.form.groups.groupName', { letter })}</strong>
                  <small>
                    {circuit
                      ? t('routine.form.groups.circuitSummary')
                      : t('routine.form.groups.straightSummary')}
                  </small>
                </div>
              </header>
            )}

            {grouped && (
              <AppSegmented
                className={styles.modeSwitch}
                label={t('routine.form.groups.modeAria', { letter })}
                options={[
                  { label: t('routine.form.groups.straight'), value: 'straight' as GroupMode },
                  { label: t('routine.form.groups.circuit'), value: 'circuit' as GroupMode },
                ]}
                value={group.mode}
                onChange={(mode) => onChange(setMode(groups, group.id, mode))}
              />
            )}

            {circuit && (
              <div className={styles.settings}>
                {/* Two rests, because a circuit has two places to take one: on
                    the walk to the next station, and once the lap closes. */}
                <div className={styles.settingRow}>
                  <label className={styles.settingLabel} htmlFor={`rest-exercise-${group.id}`}>
                    {t('routine.form.groups.restExercise')}
                  </label>
                  <AppNumberField
                    id={`rest-exercise-${group.id}`}
                    className={styles.secondsField}
                    inputMode="numeric"
                    unit={t('common.sec')}
                    value={group.restBetweenExercisesSeconds}
                    onChange={(seconds) =>
                      onChange(
                        withGroup(groups, group.id, {
                          restBetweenExercisesSeconds: clampRest(seconds),
                        }),
                      )
                    }
                  />
                </div>

                <div className={styles.settingRow}>
                  <label className={styles.settingLabel} htmlFor={`rest-round-${group.id}`}>
                    {t('routine.form.groups.restRound')}
                  </label>
                  <AppNumberField
                    id={`rest-round-${group.id}`}
                    className={styles.secondsField}
                    inputMode="numeric"
                    unit={t('common.sec')}
                    value={group.restBetweenRoundsSeconds}
                    onChange={(seconds) =>
                      onChange(
                        withGroup(groups, group.id, {
                          restBetweenRoundsSeconds: clampRest(seconds),
                        }),
                      )
                    }
                  />
                </div>
              </div>
            )}

            {group.entries.length > 0 ? (
              <ol className={styles.exercises}>
                {group.entries.map((entry, position) => {
                  const name = nameOf(entry.exerciseId)

                  return (
                    <li key={entry.key}>
                      <div className={styles.entryRow}>
                        <span className={styles.position}>{position + 1}</span>
                        <span className={styles.exerciseName}>{name}</span>

                        <AppIconButton
                          className={styles.moveButton}
                          icon={ChevronUpIcon}
                          label={t('routine.form.groups.moveUp', { name })}
                          disabled={position === 0}
                          onClick={() => onChange(moveEntryWithinGroup(groups, entry.key, -1))}
                        />
                        <AppIconButton
                          className={styles.moveButton}
                          icon={ChevronDownIcon}
                          label={t('routine.form.groups.moveDown', { name })}
                          disabled={position === group.entries.length - 1}
                          onClick={() => onChange(moveEntryWithinGroup(groups, entry.key, 1))}
                        />

                        <DropdownButton
                          className={styles.moveMenu}
                          label={t('routine.form.groups.entryActions', { name })}
                          items={entryActions(entry.key, group.id, entry.exerciseId, name)}
                        />
                      </div>

                      {/* A circuit rests on the way to the next exercise and on
                          the way into the next round, so only straight sets have
                          somewhere to put a rest of their own. Left empty, the
                          exercise library still says how long it is — which is
                          what the placeholder shows. */}
                      {!circuit && (
                        <div className={styles.entryRest}>
                          <label className={styles.entryRestLabel} htmlFor={`rest-set-${entry.key}`}>
                            {t('routine.form.groups.restSet')}
                          </label>
                          <AppNumberField
                            id={`rest-set-${entry.key}`}
                            className={styles.secondsField}
                            inputMode="numeric"
                            unit={t('common.sec')}
                            // Every row's label reads the same, so the name is
                            // what tells a screen reader which one this is.
                            aria-label={t('routine.form.groups.restSetAria', { name })}
                            placeholder={String(libraryRestOf(entry.exerciseId))}
                            value={entry.restSeconds}
                            onChange={(seconds) =>
                              onChange(
                                setEntryRest(
                                  groups,
                                  entry.key,
                                  seconds === undefined ? undefined : clampRest(seconds),
                                ),
                              )
                            }
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className={styles.emptyGroup}>{t('routine.form.groups.empty')}</p>
            )}

            <div className={styles.groupActions}>
              <AppButton
                type="button"
                colour="secondary"
                size="sm"
                className={styles.addExercise}
                onClick={() => onAddExercise(group.id)}
              >
                <PlusIcon className="size-4" aria-hidden="true" /> {t('workout.addExercise')}
              </AppButton>

              {/* The icon alone: naming the group again would take room from
                  the action people actually come here for. */}
              {groups.length > 1 && (
                <AppIconButton
                  icon={TrashIcon}
                  tone="danger"
                  label={t('routine.form.groups.removeGroup', { letter })}
                  onClick={() => onChange(removeGroup(groups, group.id))}
                />
              )}
            </div>
          </section>
        )
      })}

      {grouped && (
        <AppOptionalAction
          label={t('routine.form.groups.addGroup')}
          onClick={() => onChange(addGroup(groups))}
        />
      )}
    </>
  )
}
