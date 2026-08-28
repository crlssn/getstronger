import type { DraftGroup, GroupMode } from '@/utils/routineGroups'

import { Bars3Icon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { AppDurationStepper } from '@/ui/components/AppDurationStepper'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { AppStepper } from '@/ui/components/AppStepper'
import { AppSwitch } from '@/ui/components/AppSwitch'
import { AppValueChip } from '@/ui/components/AppValueChip'
import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'
import {
  addGroup,
  defaultRoundRestSeconds,
  defaultRounds,
  groupLetter,
  maximumRounds,
  removeEntry,
  removeGroup,
  reorderEntry,
  setEntryRest,
} from '@/utils/routineGroups'
import { useSortable } from '@/utils/useSortable'
import styles from './RoutineGroupsEditor.module.css'

interface Props {
  groups: DraftGroup[]
  /** Whether the groups are shown as groups, or as the one block a plain routine is. */
  grouped: boolean
  /** Names come from the routine and from the picker, so nothing is fetched here. */
  nameOf: (exerciseId: string) => string
  onChange: (groups: DraftGroup[]) => void
  onAddExercise: (groupId: string) => void
}

const withGroup = (groups: DraftGroup[], groupId: string, changes: Partial<DraftGroup>) =>
  groups.map((group) => (group.id === groupId ? { ...group, ...changes } : group))

const setMode = (groups: DraftGroup[], groupId: string, mode: GroupMode) => {
  const group = groups.find((entry) => entry.id === groupId)
  if (mode !== 'circuit') return withGroup(groups, groupId, { mode })

  // A circuit that has never been set up still arrives ready to run, with the
  // rest that belongs to the round rather than to the set, and a prescription
  // to go round more than once.
  return withGroup(groups, groupId, {
    mode,
    restBetweenRoundsSeconds: group?.restBetweenRoundsSeconds || defaultRoundRestSeconds,
    rounds: group?.rounds || defaultRounds,
  })
}

interface EntriesProps {
  groups: DraftGroup[]
  group: DraftGroup
  /** Whether the rest between sets is a setting this block has at all. */
  restBetweenSets: boolean
  nameOf: (exerciseId: string) => string
  onChange: (groups: DraftGroup[]) => void
}

/**
 * A group's exercises, in the order they are trained.
 *
 * Its own component because each list is dragged on its own, and a hook cannot
 * be called once per group from a loop.
 */
const GroupEntries = ({ groups, group, restBetweenSets, nameOf, onChange }: EntriesProps) => {
  const { t } = useTranslation()

  // Which row has its rest open. One at a time: a rest is a detour from
  // building the routine rather than a column of the list.
  const [openEntry, setOpenEntry] = useState('')

  // SortableJS moves the rows itself; the draft is reordered to match so React
  // renders the order it is already looking at.
  const list = useSortable<HTMLOListElement>(
    {
      handle: `.${styles.dragHandle}`,
      ghostClass: styles.sortableGhost,
      dragClass: styles.sortableDrag,
      animation: 150,
      onReorder: (from, to) => onChange(reorderEntry(groups, group.id, from, to)),
    },
    group.entries.length > 1,
  )

  if (!group.entries.length) {
    return <AppEmptyInline>{t('routine.form.groups.empty')}</AppEmptyInline>
  }

  return (
    <ol ref={list} className={styles.exercises}>
      {group.entries.map((entry, position) => {
        const name = nameOf(entry.exerciseId)
        const rest = formatMeasurementDuration(entry.restSeconds)
        const open = restBetweenSets && openEntry === entry.key

        return (
          <li key={entry.key}>
            <div className={styles.entryRow}>
              <span className={styles.position}>{String(position + 1).padStart(2, '0')}</span>
              <span className={styles.exerciseName}>{name}</span>

              {/* The rest reads as a value on the row and unfolds its stepper
                  only for somebody tuning it. */}
              {restBetweenSets && (
                <AppValueChip
                  label={t('routine.form.groups.restSetChip', { name, value: rest })}
                  value={rest}
                  expanded={open}
                  onClick={() => setOpenEntry(open ? '' : entry.key)}
                />
              )}

              {/* Quiet, unlike the group's own bin: taking an exercise out of a
                  block is undone by adding it again, and a column of red would
                  shout the list down. */}
              <AppIconButton
                icon={TrashIcon}
                label={t('routine.form.groups.removeExercise', { name })}
                onClick={() => onChange(removeEntry(groups, entry.key))}
              />
              <AppIconButton
                className={styles.dragHandle}
                icon={Bars3Icon}
                label={t('routine.form.groups.reorder', { name })}
              />
            </div>

            {/* Zero is an answer here: it turns the timer off for this
                occurrence alone. */}
            {open && (
              <div className={styles.entryRest}>
                <span className={styles.entryRestLabel}>{t('routine.form.groups.restSet')}</span>
                <AppDurationStepper
                  // Every row's label reads the same, so the name is what tells
                  // a screen reader which one this is.
                  label={t('routine.form.groups.restSetAria', { name })}
                  value={entry.restSeconds}
                  onChange={(seconds) => onChange(setEntryRest(groups, entry.key, seconds))}
                />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The exercises of a routine, in the blocks that train them.
 *
 * A group is a card of the page, not a box inside another box. On a phone the
 * exercise name is the first thing to lose room, and every border it sits
 * inside takes some of it — so nothing here is boxed, only ruled. How the block
 * runs sits beside its badge above the card, where it reads as a property of
 * the group rather than as another full-width control inside it.
 */
export const RoutineGroupsEditor = ({
  groups,
  grouped,
  nameOf,
  onChange,
  onAddExercise,
}: Props) => {
  const { t } = useTranslation()

  return (
    <>
      {groups.map((group, index) => {
        const letter = groupLetter(index)
        const circuit = group.mode === 'circuit'
        // A rest between exercises is a rest between two of them, so a block
        // holding one is not asked about the walk it never takes.
        const walksBetweenExercises = group.entries.length > 1

        return (
          <section key={group.id} className={styles.group}>
            {/* Only a group is named. The plain block a routine starts as is
                the whole of the form's exercise list. */}
            {grouped && (
              <>
                <header className={styles.groupHeader}>
                  <span className={styles.groupBadge} aria-hidden="true">
                    {letter}
                  </span>
                  <strong className={styles.groupTitle}>
                    {t('routine.form.groups.groupName', { letter })}
                  </strong>
                  <AppSegmented
                    className={styles.modeSwitch}
                    density="compact"
                    label={t('routine.form.groups.modeAria', { letter })}
                    options={[
                      { label: t('routine.form.groups.straight'), value: 'straight' as GroupMode },
                      { label: t('routine.form.groups.circuit'), value: 'circuit' as GroupMode },
                    ]}
                    value={group.mode}
                    onChange={(mode) => onChange(setMode(groups, group.id, mode))}
                  />
                </header>
                <div className={styles.groupHintRow}>
                  <p className={styles.groupHint}>
                    {circuit
                      ? t('routine.form.groups.circuitSummary')
                      : t('routine.form.groups.straightSummary')}
                  </p>
                  {/* Quiet, and nowhere near the button that fills the group:
                      what it removes is the block, not the exercises in it —
                      those fold into the group above. */}
                  {groups.length > 1 && (
                    <AppButton
                      type="button"
                      colour="ghost"
                      size="inline"
                      width="auto"
                      className={styles.removeGroup}
                      aria-label={t('routine.form.groups.removeGroup', { letter })}
                      onClick={() => onChange(removeGroup(groups, group.id))}
                    >
                      {t('common.remove')}
                    </AppButton>
                  )}
                </div>
              </>
            )}

            <div className={styles.groupCard}>
              {/* The switch is the whole answer for most routines, which want a
                  rest timer and do not care how long: the lengths only appear
                  for somebody who came to change them. */}
              <div className={styles.settings}>
                {/* Above the rest timers, and outside them: how many times the
                    block is worked through is not a rest, and a circuit with
                    its timer off is still prescribed for the rounds it says. */}
                {circuit && (
                  <div className={styles.settingRow}>
                    <div className={styles.settingLabel}>
                      {t('routine.form.groups.rounds')}
                      {/* Zero is an answer of its own, and the one every
                          circuit gave before one could be prescribed. */}
                      <small>
                        {group.rounds > 0
                          ? t('routine.form.groups.roundsHint', { count: group.rounds })
                          : t('routine.form.groups.roundsOpen')}
                      </small>
                    </div>
                    <AppStepper
                      label={
                        grouped
                          ? t('routine.form.groups.roundsAriaGroup', { letter })
                          : t('routine.form.groups.roundsAria')
                      }
                      value={group.rounds}
                      format={(rounds) =>
                        rounds > 0 ? String(rounds) : t('routine.form.groups.roundsAny')
                      }
                      decreaseLabel={t('routine.form.groups.roundsDecrease', {
                        label: t('routine.form.groups.rounds'),
                      })}
                      increaseLabel={t('routine.form.groups.roundsIncrease', {
                        label: t('routine.form.groups.rounds'),
                      })}
                      max={maximumRounds}
                      onChange={(rounds) => onChange(withGroup(groups, group.id, { rounds }))}
                    />
                  </div>
                )}

                <div className={styles.settingRow}>
                  <div className={styles.settingLabel}>
                    {t('routine.form.groups.restTimers')}
                    {/* Off is not a folded-away setting but an answer, so the
                        line states it rather than advertising lengths the
                        routine is not training with. */}
                    <small>
                      {group.restTimers
                        ? t(
                            circuit
                              ? 'routine.form.groups.restTimersHintCircuit'
                              : 'routine.form.groups.restTimersHint',
                          )
                        : t(
                            circuit
                              ? 'routine.form.groups.restTimersOffCircuit'
                              : 'routine.form.groups.restTimersOff',
                          )}
                    </small>
                  </div>
                  <AppSwitch
                    checked={group.restTimers}
                    label={
                      grouped
                        ? t('routine.form.groups.restTimersAria', { letter })
                        : t('routine.form.groups.restTimers')
                    }
                    onChange={(restTimers) => onChange(withGroup(groups, group.id, { restTimers }))}
                  />
                </div>

                {group.restTimers && (walksBetweenExercises || circuit) && (
                  <div className={styles.restLengths}>
                    {walksBetweenExercises && (
                      <div className={styles.restRow}>
                        <span className={styles.restLabel}>
                          {t('routine.form.groups.restExercise')}
                        </span>
                        <AppDurationStepper
                          label={
                            grouped
                              ? t('routine.form.groups.restExerciseAriaGroup', { letter })
                              : t('routine.form.groups.restExerciseAria')
                          }
                          value={group.restBetweenExercisesSeconds}
                          onChange={(seconds) =>
                            onChange(
                              withGroup(groups, group.id, { restBetweenExercisesSeconds: seconds }),
                            )
                          }
                        />
                      </div>
                    )}

                    {circuit && (
                      <div className={styles.restRow}>
                        <span className={styles.restLabel}>
                          {t('routine.form.groups.restRound')}
                        </span>
                        <AppDurationStepper
                          label={
                            grouped
                              ? t('routine.form.groups.restRoundAriaGroup', { letter })
                              : t('routine.form.groups.restRoundAria')
                          }
                          value={group.restBetweenRoundsSeconds}
                          onChange={(seconds) =>
                            onChange(
                              withGroup(groups, group.id, { restBetweenRoundsSeconds: seconds }),
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <GroupEntries
                groups={groups}
                group={group}
                // A circuit rests on the way to the next exercise and on the way
                // into the next round, so only straight sets have somewhere to
                // put a rest of their own.
                restBetweenSets={group.restTimers && !circuit}
                nameOf={nameOf}
                onChange={onChange}
              />

              <div className={styles.groupActions}>
                <AppButton
                  type="button"
                  colour="ghost"
                  size="sm"
                  className={styles.addExercise}
                  onClick={() => onAddExercise(group.id)}
                >
                  <PlusIcon className="size-4" aria-hidden="true" /> {t('workout.addExercise')}
                </AppButton>
              </div>
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
