import type { DistanceUnit } from '@/proto/api/v1/shared_pb'
import type { DraftGroup } from '@/utils/routineGroups'

import { Bars3Icon, MinusCircleIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { AppCard } from '@/ui/components/AppCard'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppValueChip } from '@/ui/components/AppValueChip'
import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'
import { moveEntry, removeEntry, reorderEntry } from '@/utils/routineGroups'
import { prescriptionOf } from '@/utils/routinePrescription'
import { useSortable } from '@/utils/useSortable'
import styles from './RoutineBlockSection.module.css'

/** The SortableJS group every block's list joins, so a row can cross between them. */
const sortableGroup = 'routine-block'

interface Props {
  groups: DraftGroup[]
  group: DraftGroup
  /** What the block is called on screen: its own name, or "Block A". */
  title: string
  /** The letter this block would be known by, for the tile of a straight one. */
  letter: string
  /** Names come from the routine and from the picker, so nothing is fetched here. */
  nameOf: (exerciseId: string) => string
  distanceUnit?: DistanceUnit
  onChange: (groups: DraftGroup[]) => void
  onOpenBlock: () => void
  onOpenEntry: (key: string) => void
  onAddExercise: () => void
}

/**
 * One block of a routine: what it is called, how it runs, and the exercises in
 * it in the order they are trained.
 *
 * Its own component because each list is dragged on its own, and a hook cannot
 * be called once per block from a loop. Everything a block is set up with lives
 * behind the chip beside its name: the list stays a list, and the settings stay
 * out of the way of building one.
 */
export const RoutineBlockSection = ({
  groups,
  group,
  title,
  letter,
  nameOf,
  distanceUnit,
  onChange,
  onOpenBlock,
  onOpenEntry,
  onAddExercise,
}: Props) => {
  const { t } = useTranslation()

  const circuit = group.mode === 'circuit'
  // Zero rounds is the open-ended circuit a routine ran before a count could be
  // prescribed: as many rounds as the session takes.
  const open = circuit && group.rounds < 1

  // SortableJS moves the rows itself; the draft is reordered to match so React
  // renders the order it is already looking at. Every block's list shares one
  // group, so a row can be dragged into the block that should train it.
  const list = useSortable<HTMLOListElement>({
    group: sortableGroup,
    handle: `.${styles.dragHandle}`,
    // The empty state is a row of the list so the block can be dropped into,
    // not a row of the routine: it has nothing to drag.
    filter: `.${styles.empty}`,
    ghostClass: styles.sortableGhost,
    dragClass: styles.sortableDrag,
    animation: 150,
    onReorder: (from, to) => onChange(reorderEntry(groups, group.id, from, to)),
    onMoveBetween: (move) =>
      onChange(
        moveEntry(
          groups,
          move.from.dataset.groupId ?? '',
          move.fromIndex,
          move.to.dataset.groupId ?? '',
          move.toIndex,
        ),
      ),
  })

  const restValue = circuit ? group.restBetweenRoundsSeconds : group.restBetweenExercisesSeconds
  const chipValue = restValue
    ? t('routine.form.blocks.rest', { value: formatMeasurementDuration(restValue) })
    : t('routine.form.blocks.noRest')
  const roundsTile = open
    ? t('routine.form.blocks.roundsTileOpen')
    : t('routine.form.blocks.roundsTile', { count: group.rounds })

  return (
    <section className={styles.block}>
      <header className={styles.header}>
        <span className={circuit ? styles.tileCircuit : styles.tile} aria-hidden="true">
          {circuit ? roundsTile : letter}
        </span>
        <div className={styles.heading}>
          <strong className={styles.title}>{title}</strong>
          <span className={styles.meta}>
            {circuit
              ? open
                ? t('routine.form.blocks.circuitMetaOpen')
                : t('routine.form.blocks.circuitMeta', { count: group.rounds })
              : t('routine.form.blocks.straightMeta')}
          </span>
        </div>
        {/* The only way into a block's settings: everything it is set up with
            is one tap behind the value it is worth showing on the row. */}
        <AppValueChip
          // Every block's chip reads the same, so the name is what tells a
          // screen reader which block this one opens.
          label={t('routine.form.blocks.settings', { title })}
          caption={circuit ? roundsTile : t('routine.form.blocks.straight')}
          value={chipValue}
          onClick={onOpenBlock}
        />
      </header>

      <AppCard className={styles.card}>
        {/* The list is rendered even while the block holds nothing: an empty
            block is where a row dragged out of a full one is going. */}
        <ol ref={list} className={styles.exercises} data-group-id={group.id}>
          {group.entries.length ? (
            group.entries.map((entry, position) => {
              const name = nameOf(entry.exerciseId)
              const chip = prescriptionOf(entry, t, distanceUnit)

              return (
                <li key={entry.key} className={styles.entryRow}>
                  <span className={styles.position}>{String(position + 1).padStart(2, '0')}</span>
                  <span className={styles.exerciseName}>{name}</span>

                  <AppValueChip
                    label={t('routine.form.blocks.exerciseSettings', { name })}
                    caption={chip.caption}
                    value={chip.value}
                    onClick={() => onOpenEntry(entry.key)}
                  />

                  {/* A circled minus, which is what taking one row out of a
                      list looks like everywhere in the app. Quiet, too:
                      removing an exercise is undone by adding it again, and a
                      column of red would shout the list down. */}
                  <AppIconButton
                    size="sm"
                    icon={MinusCircleIcon}
                    label={t('routine.form.blocks.removeExercise', { name })}
                    onClick={() => onChange(removeEntry(groups, entry.key))}
                  />
                  <AppIconButton
                    size="sm"
                    className={styles.dragHandle}
                    icon={Bars3Icon}
                    label={t('routine.form.blocks.reorder', { name })}
                  />
                </li>
              )
            })
          ) : (
            <li className={styles.empty}>
              <AppEmptyInline>{t('routine.form.blocks.empty')}</AppEmptyInline>
            </li>
          )}
        </ol>

        <div className={styles.actions}>
          <AppButton type="button" colour="ghost" size="sm" onClick={onAddExercise}>
            <PlusIcon className="size-4" aria-hidden="true" /> {t('workout.addExercise')}
          </AppButton>
        </div>
      </AppCard>
    </section>
  )
}
