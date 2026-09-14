import type { DraftGroup, GroupMode } from '@/utils/routineGroups'

import { useTranslation } from 'react-i18next'

import { AppDurationStepper } from '@/ui/components/AppDurationStepper'
import { AppInput } from '@/ui/components/AppInput'
import { AppPreferenceRow } from '@/ui/components/AppPreferenceRow'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppStepper } from '@/ui/components/AppStepper'
import { AppSwitch } from '@/ui/components/AppSwitch'
import { maximumRounds } from '@/utils/routineGroups'
import styles from './RoutineSheet.module.css'

/** How far a block's rounds may be prescribed before it is a different sport. */
const roundsCeiling = 20

interface Props {
  group: DraftGroup
  /** What the block is called on screen, which is the sheet's title. */
  title: string
  /** The letter it would be known by, which the name field offers as its placeholder. */
  letter: string
  /** Whether removing it is on offer, which the last block never is. */
  removable: boolean
  onChange: (changes: Partial<DraftGroup>) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * Everything a block is set up with, in the one place it is set up.
 *
 * Edits land as they are made; "Done" only closes. A sheet that saved on close
 * would be a second state to keep, and a block half-changed is a block the
 * summary line above is already counting.
 */
export const RoutineBlockSheet = ({
  group,
  title,
  letter,
  removable,
  onChange,
  onRemove,
  onClose,
}: Props) => {
  const { t } = useTranslation()

  const circuit = group.mode === 'circuit'
  // Zero rounds is the open-ended circuit a routine ran before a count could be
  // prescribed, and the stepper keeps it reachable rather than quietly
  // prescribing three for a routine that asked for none.
  const open = circuit && group.rounds < 1

  return (
    <AppSheet
      eyebrow={t('routine.form.blocks.eyebrow')}
      title={title}
      closeLabel={t('common.close')}
      onClose={onClose}
      actions={
        <>
          <SheetAction tone="primary" onClick={onClose}>
            {t('common.done')}
          </SheetAction>
          {removable && (
            <SheetAction tone="danger" onClick={onRemove}>
              {t('routine.form.blocks.removeBlock')}
            </SheetAction>
          )}
        </>
      }
    >
      <div className={styles.sheetBody}>
        <AppInput
          label={t('routine.form.blocks.nameLabel')}
          value={group.title}
          type="text"
          autoComplete="off"
          placeholder={t('routine.form.blocks.blockName', { letter })}
          onChange={(event) => onChange({ title: event.target.value })}
        />

        <div>
          <AppSegmented<GroupMode>
            className={styles.segmented}
            label={t('routine.form.blocks.style')}
            options={[
              { label: t('routine.form.blocks.straight'), value: 'straight' },
              { label: t('routine.form.blocks.circuit'), value: 'circuit' },
            ]}
            value={group.mode}
            onChange={(mode) => onChange({ mode })}
          />
          <p className={styles.lead}>
            {circuit ? t('routine.form.blocks.circuitLead') : t('routine.form.blocks.straightLead')}
          </p>
        </div>

        <div className={styles.rows}>
          {circuit && (
            <AppPreferenceRow
              title={t('routine.form.blocks.rounds')}
              body={
                open
                  ? t('routine.form.blocks.roundsBodyOpen')
                  : t('routine.form.blocks.roundsBody', { count: group.rounds })
              }
              control={
                <AppStepper
                  label={t('routine.form.blocks.rounds')}
                  value={group.rounds}
                  format={(rounds) =>
                    rounds > 0 ? String(rounds) : t('routine.form.blocks.roundsAny')
                  }
                  decreaseLabel={t('routine.form.blocks.roundsDecrease', {
                    label: t('routine.form.blocks.rounds'),
                  })}
                  increaseLabel={t('routine.form.blocks.roundsIncrease', {
                    label: t('routine.form.blocks.rounds'),
                  })}
                  max={Math.min(roundsCeiling, maximumRounds)}
                  onChange={(rounds) => onChange({ rounds })}
                />
              }
            />
          )}

          {/* Zero is an answer here, and the only one there is: a block that
              rests for nothing is a block with no timer. */}
          <AppPreferenceRow
            title={t('routine.form.blocks.restExercise')}
            body={t('routine.form.blocks.restBody')}
            control={
              <AppDurationStepper
                label={t('routine.form.blocks.restExercise')}
                value={group.restBetweenExercisesSeconds}
                onChange={(restBetweenExercisesSeconds) =>
                  onChange({ restBetweenExercisesSeconds })
                }
              />
            }
          />

          {circuit && (
            <AppPreferenceRow
              title={t('routine.form.blocks.restRound')}
              body={t('routine.form.blocks.restBody')}
              control={
                <AppDurationStepper
                  label={t('routine.form.blocks.restRound')}
                  value={group.restBetweenRoundsSeconds}
                  onChange={(restBetweenRoundsSeconds) => onChange({ restBetweenRoundsSeconds })}
                />
              }
            />
          )}

          {circuit && (
            <AppPreferenceRow
              title={t('routine.form.blocks.skip')}
              body={
                group.skipLastOnFinalRound
                  ? t('routine.form.blocks.skipOn')
                  : t('routine.form.blocks.skipOff')
              }
              control={
                <AppSwitch
                  label={t('routine.form.blocks.skip')}
                  checked={group.skipLastOnFinalRound}
                  onChange={(skipLastOnFinalRound) => onChange({ skipLastOnFinalRound })}
                />
              }
            />
          )}
        </div>
      </div>
    </AppSheet>
  )
}
