import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { DraftGroup } from '@/utils/routineGroups'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { AppList } from '@/ui/components/AppList'
import { AppListItemInput } from '@/ui/components/AppListItemInput'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { RoutineGroupsEditor } from '@/ui/routines/RoutineGroupsEditor'
import { ExercisePickerSheet } from '@/ui/workouts/ExercisePickerSheet'
import {
  addExerciseToGroup,
  draftGroupsFromRoutine,
  groupExerciseIds,
  groupLetter,
  collapseToSingleGroup,
  isGrouped,
  saveableGroups,
} from '@/utils/routineGroups'
import styles from './RoutineForm.module.css'

interface Props {
  submitLabel: string
  onSave: (name: string, exerciseIds: string[], groups: DraftGroup[]) => void
  saving?: boolean
  initialName?: string
  /** The routine's exercises, which is where the form reads their names from. */
  initialExercises?: Exercise[]
  initialGroups?: RoutineGroup[]
}

/**
 * The fields a routine is made of, shared by creating one and editing one.
 *
 * Exercises are picked into the group that will train them rather than ticked
 * off a list of the whole library: a routine is built in the order it is
 * trained, and the same exercise may be picked twice — a bench press in the
 * warm-up and a bench press in the circuit are two different pieces of work.
 *
 * The caller mounts it only once it has the routine to edit, so the initial
 * values are read once and owned here from then on.
 */
export const RoutineForm = ({
  submitLabel,
  onSave,
  saving = false,
  initialName = '',
  initialExercises,
  initialGroups,
}: Props) => {
  const { t } = useTranslation()

  const initial = draftGroupsFromRoutine(
    initialGroups ?? [],
    (initialExercises ?? []).map((exercise) => exercise.id),
  )

  const [name, setName] = useState(initialName)
  const [groups, setGroups] = useState<DraftGroup[]>(() => initial)
  // Grouping is the advanced half of the screen: a routine that is one plain
  // block never has to meet it, and one that is already grouped opens on it.
  const [advanced, setAdvanced] = useState(() => isGrouped(initial))
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
  // The group the picker is adding to, so the sheet's choice knows where it goes.
  const [pickerGroupId, setPickerGroupId] = useState('')

  const exerciseIds = groupExerciseIds(groups)
  // A routine with no name or no exercises is not a routine yet.
  const canSubmit = name.trim().length > 0 && exerciseIds.length > 0 && !saving

  // Turning grouping off keeps the exercises, in order, and drops the structure
  // — the one thing a single block cannot express.
  const setAdvancedMode = (enabled: boolean) => {
    setAdvanced(enabled)
    if (!enabled) setGroups(collapseToSingleGroup(groups))
  }

  const addExercise = (exercise: Exercise) => {
    setLibrary((current) => ({ ...current, [exercise.id]: exercise }))
    setGroups((current) => addExerciseToGroup(current, pickerGroupId, exercise))
    setPickerGroupId('')
  }

  const submit = () => {
    const saved = saveableGroups(groups)
    onSave(name.trim(), groupExerciseIds(saved), saved)
  }

  const pickerGroupIndex = groups.findIndex((group) => group.id === pickerGroupId)

  return (
    <form
      className={styles.routineForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) submit()
      }}
    >
      <h6>{t('routine.form.name')}</h6>
      <AppList>
        <AppListItemInput
          label={t('routine.form.name')}
          model={name}
          type="text"
          required
          autoComplete="off"
          placeholder={t('routine.form.namePlaceholder')}
          onUpdate={setName}
        />
      </AppList>

      {/* The question that decides the shape of everything below it, so it is
          asked before any of it. */}
      <h6>{t('routine.form.groups.section')}</h6>
      <AppSegmented
        className={styles.structure}
        label={t('routine.form.groups.section')}
        options={[
          { label: t('routine.form.groups.simple'), value: false },
          { label: t('routine.form.groups.advanced'), value: true },
        ]}
        value={advanced}
        onChange={setAdvancedMode}
      />

      <h6>{t('common.exercises')}</h6>
      <RoutineGroupsEditor
        groups={groups}
        grouped={advanced}
        nameOf={(exerciseId) => library[exerciseId]?.name ?? exerciseId}
        onChange={setGroups}
        onAddExercise={setPickerGroupId}
      />

      {/* At the end of the form rather than floating over it: the save belongs
          to the routine above it, and every other form ends the same way. */}
      <div className={styles.formActions}>
        <AppButton type="submit" colour="primary" disabled={!canSubmit}>
          {saving ? t('training.planForm.saving') : submitLabel}
        </AppButton>
        <AppButton type="link" to="/routines" colour="secondary">
          {t('common.cancel')}
        </AppButton>
      </div>

      {pickerGroupId && (
        <ExercisePickerSheet
          // The block trains each exercise once, so what it already holds is
          // not offered again — another block still can.
          excluded={
            groups
              .find((group) => group.id === pickerGroupId)
              ?.entries.map((entry) => entry.exerciseId) ?? []
          }
          eyebrow={
            advanced && pickerGroupIndex >= 0
              ? t('routine.form.groups.groupName', { letter: groupLetter(pickerGroupIndex) })
              : t('routine.form.eyebrow')
          }
          onAdd={addExercise}
          onClose={() => setPickerGroupId('')}
        />
      )}
    </form>
  )
}
