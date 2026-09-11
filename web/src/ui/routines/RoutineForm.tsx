import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import type {
  DraftEntry,
  DraftGroup,
  ExerciseTracking,
  IntervalRole,
  StartingShape,
} from '@/utils/routineGroups'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePreferencesStore } from '@/stores/preferences'
import { AppButton } from '@/ui/components/AppButton'
import { AppFormFooter } from '@/ui/components/AppFormFooter'
import { AppInput } from '@/ui/components/AppInput'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { RoutineBlockSection } from '@/ui/routines/RoutineBlockSection'
import { RoutineBlockSheet } from '@/ui/routines/RoutineBlockSheet'
import { RoutineExerciseSheet } from '@/ui/routines/RoutineExerciseSheet'
import { RoutineStartSheet } from '@/ui/routines/RoutineStartSheet'
import { intervalPartTitle } from '@/ui/routines/intervalParts'
import { ExercisePickerSheet } from '@/ui/workouts/ExercisePickerSheet'
import {
  addExerciseToGroup,
  addGroup,
  draftGroupsFromRoutine,
  groupExerciseIds,
  groupLetter,
  intervalRoles,
  plannedIntervals,
  plannedSeconds,
  removeEntry,
  removeGroup,
  saveableGroups,
  startingBlocks,
  withEntry,
  withGroup,
} from '@/utils/routineGroups'
import { trackingOptions } from '@/utils/routinePrescription'
import styles from './RoutineForm.module.css'

/** Which sheet is open, and what it is open about. */
type Sheet =
  | { kind: 'start' }
  | { kind: 'block'; id: string }
  | { kind: 'entry'; key: string }
  | { kind: 'add'; id: string; tracking: ExerciseTracking }

const secondsPerMinute = 60

interface Props {
  submitLabel: string
  onSave: (name: string, exerciseIds: string[], groups: DraftGroup[]) => void
  saving?: boolean
  /** Why the last save failed, rendered inline beside the submit. */
  error?: string
  initialName?: string
  /** The routine's exercises, which is where the form reads their names from. */
  initialExercises?: Exercise[]
  initialGroups?: RoutineGroup[]
  /** Whether to open on the starting shapes, which only a new routine does. */
  startable?: boolean
}

/**
 * The fields a routine is made of, shared by creating one and editing one.
 *
 * A routine is an ordered list of blocks, and a block is an ordered list of
 * exercises that may repeat. There is no mode: a plain session is one straight
 * block, a circuit is one block that goes round, and an interval session is a
 * warm-up, a repeating block and a cool-down — three shapes of the same thing,
 * so none of them is a fork in the screen.
 *
 * Everything a block or an exercise is set up with lives in a sheet behind the
 * value on its row. The list stays a list, which is what it is here to build.
 *
 * The caller mounts it only once it has the routine to edit, so the initial
 * values are read once and owned here from then on.
 */
export const RoutineForm = ({
  submitLabel,
  onSave,
  saving = false,
  error,
  initialName = '',
  initialExercises,
  initialGroups,
  startable = false,
}: Props) => {
  const { t } = useTranslation()
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)

  const [name, setName] = useState(initialName)
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    draftGroupsFromRoutine(
      initialGroups ?? [],
      (initialExercises ?? []).map((exercise) => exercise.id),
    ),
  )
  // Every exercise the form has seen: the ones the routine came with, and the
  // ones picked since. Its name is what labels the row.
  const [library, setLibrary] = useState<Record<string, Exercise>>(() =>
    Object.fromEntries(
      [
        ...(initialExercises ?? []),
        ...(initialGroups ?? []).flatMap((group) =>
          group.exercises.map((entry) => entry.exercise).filter((exercise) => !!exercise),
        ),
      ].map((exercise) => [exercise.id, exercise]),
    ),
  )
  const [sheet, setSheet] = useState<Sheet | null>(startable ? { kind: 'start' } : null)

  const closeSheet = () => setSheet(null)

  const exerciseIds = groupExerciseIds(groups)
  const needsName = name.trim().length === 0
  const needsExercise = exerciseIds.length === 0
  // A routine with no name or no exercises is not a routine yet.
  const canSubmit = !needsName && !needsExercise && !saving

  // Read off the same two conditions the submit is, so the line can never name
  // a requirement the button is not actually waiting for.
  const missing = needsName
    ? needsExercise
      ? t('routine.form.needsNameAndExercise')
      : t('routine.form.needsName')
    : needsExercise
      ? t('routine.form.needsExercise')
      : undefined

  const nameOf = (exerciseId: string) => library[exerciseId]?.name ?? exerciseId
  const titleOf = (group: DraftGroup, index: number) =>
    group.title || t('routine.form.blocks.blockName', { letter: groupLetter(index) })

  const start = (shape: StartingShape) => {
    const titles = Object.fromEntries(
      intervalRoles.map((role) => [role, t(intervalPartTitle[role])]),
    ) as Record<IntervalRole, string>
    setGroups(startingBlocks(shape, titles))
    closeSheet()
  }

  const addExercise = (exercise: Exercise, groupId: string, tracking: ExerciseTracking) => {
    setLibrary((current) => ({ ...current, [exercise.id]: exercise }))
    setGroups((current) => addExerciseToGroup(current, groupId, exercise, tracking))
    closeSheet()
  }

  const submit = () => {
    const saved = saveableGroups(groups)
    onSave(name.trim(), groupExerciseIds(saved), saved)
  }

  const minutes = Math.max(Math.round(plannedSeconds(groups) / secondsPerMinute), 1)
  const intervals = plannedIntervals(groups)

  const openBlock =
    sheet?.kind === 'block' ? groups.find((group) => group.id === sheet.id) : undefined
  const openBlockIndex = openBlock ? groups.indexOf(openBlock) : -1

  const entryBlock =
    sheet?.kind === 'entry'
      ? groups.find((group) => group.entries.some((entry) => entry.key === sheet.key))
      : undefined
  const openEntry: DraftEntry | undefined =
    sheet?.kind === 'entry'
      ? entryBlock?.entries.find((entry) => entry.key === sheet.key)
      : undefined

  const addBlock = sheet?.kind === 'add' ? groups.find((group) => group.id === sheet.id) : undefined
  const addBlockIndex = addBlock ? groups.indexOf(addBlock) : -1

  return (
    <form
      className={styles.routineForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) submit()
      }}
    >
      {/* The screen's first-class field: overline label on the canvas, the
          standard input under it, no panel of its own. */}
      <AppInput
        className={styles.name}
        variant="hero"
        label={t('routine.form.name')}
        value={name}
        type="text"
        required
        autoComplete="off"
        placeholder={t('routine.form.namePlaceholder')}
        onChange={(event) => setName(event.target.value)}
      />

      <div className={styles.blocks}>
        {groups.map((group, index) => (
          <RoutineBlockSection
            key={group.id}
            groups={groups}
            group={group}
            title={titleOf(group, index)}
            letter={groupLetter(index)}
            nameOf={nameOf}
            distanceUnit={distanceUnit}
            onChange={setGroups}
            onOpenBlock={() => setSheet({ kind: 'block', id: group.id })}
            onOpenEntry={(key) => setSheet({ kind: 'entry', key })}
            onAddExercise={() =>
              setSheet({
                kind: 'add',
                id: group.id,
                // A circuit rotates through stations held against the clock,
                // so that is what an exercise added to one is by default.
                tracking: group.mode === 'circuit' ? 'timed' : 'sets',
              })
            }
          />
        ))}
      </div>

      <AppButton
        type="button"
        colour="secondary"
        className={styles.addBlock}
        onClick={() => setGroups(addGroup(groups))}
      >
        {t('routine.form.blocks.addBlock')}
      </AppButton>

      {/* What the routine adds up to, which is the one thing the list of blocks
          cannot say by being read. */}
      <p className={styles.summary}>
        <span>
          {intervals
            ? t('routine.form.blocks.planned', { count: minutes })
            : t('routine.form.blocks.plannedNone')}
        </span>
        <span>{intervals ? t('routine.form.blocks.intervals', { count: intervals }) : ''}</span>
      </p>

      {/* Pinned rather than parked at the end of the scroll, where a routine
          with ten exercises hid it. */}
      <AppFormFooter hint={missing} error={error}>
        <AppButton type="submit" colour="primary" size="lg" disabled={!canSubmit}>
          {saving ? t('training.planForm.saving') : submitLabel}
        </AppButton>
      </AppFormFooter>

      {sheet?.kind === 'start' && <RoutineStartSheet onPick={start} onClose={closeSheet} />}

      {openBlock && (
        <RoutineBlockSheet
          group={openBlock}
          title={titleOf(openBlock, openBlockIndex)}
          letter={groupLetter(openBlockIndex)}
          // The last block is the routine, so removing it is not on offer.
          removable={groups.length > 1}
          onChange={(changes) => setGroups(withGroup(groups, openBlock.id, changes))}
          onRemove={() => {
            setGroups(removeGroup(groups, openBlock.id))
            closeSheet()
          }}
          onClose={closeSheet}
        />
      )}

      {openEntry && entryBlock && (
        <RoutineExerciseSheet
          entry={openEntry}
          name={nameOf(openEntry.exerciseId)}
          eyebrow={titleOf(entryBlock, groups.indexOf(entryBlock))}
          distanceUnit={distanceUnit}
          onChange={(changes) => setGroups(withEntry(groups, openEntry.key, changes))}
          onRemove={() => {
            setGroups(removeEntry(groups, openEntry.key))
            closeSheet()
          }}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'add' && addBlock && (
        <ExercisePickerSheet
          // The block trains each exercise once, so what it already holds is
          // not offered again — another block still can.
          excluded={addBlock.entries.map((entry) => entry.exerciseId)}
          eyebrow={titleOf(addBlock, addBlockIndex)}
          header={
            <AppSegmented<ExerciseTracking>
              className={styles.tracking}
              label={t('routine.form.blocks.trackedAs')}
              options={trackingOptions(t)}
              value={sheet.tracking}
              onChange={(tracking) => setSheet({ ...sheet, tracking })}
            />
          }
          onAdd={(exercise) => addExercise(exercise, addBlock.id, sheet.tracking)}
          onClose={closeSheet}
        />
      )}
    </form>
  )
}
