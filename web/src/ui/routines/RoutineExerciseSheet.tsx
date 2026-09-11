import type { DistanceUnit } from '@/proto/api/v1/shared_pb'
import type { DraftEntry, ExerciseTracking } from '@/utils/routineGroups'

import { useTranslation } from 'react-i18next'

import { AppDurationStepper } from '@/ui/components/AppDurationStepper'
import { AppPreferenceRow } from '@/ui/components/AppPreferenceRow'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppStepper } from '@/ui/components/AppStepper'
import { formatDistanceIn } from '@/utils/exerciseMeasurements'
import {
  distanceStepMeters,
  maximumDistanceMeters,
  maximumSets,
  minimumDistanceMeters,
  minimumSets,
} from '@/utils/routineGroups'
import { trackingOptions } from '@/utils/routinePrescription'
import styles from './RoutineSheet.module.css'

/** What each way of counting the work means, in a line under the choice. */
const trackingLeads: Record<ExerciseTracking, string> = {
  sets: 'routine.form.blocks.setsLead',
  timed: 'routine.form.blocks.timedLead',
  distance: 'routine.form.blocks.distanceLead',
}

interface Props {
  entry: DraftEntry
  /** The exercise's name, which is the sheet's title. */
  name: string
  /** The block training it, said above the title so the sheet says where this is. */
  eyebrow: string
  distanceUnit?: DistanceUnit
  onChange: (changes: Partial<DraftEntry>) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * What one occurrence of an exercise prescribes.
 *
 * The three ways of counting the work are mutually exclusive, so only the
 * chosen one is asked about. All three are kept in the draft, so an occurrence
 * switched to timed and back is the one it was.
 */
export const RoutineExerciseSheet = ({
  entry,
  name,
  eyebrow,
  distanceUnit,
  onChange,
  onRemove,
  onClose,
}: Props) => {
  const { t } = useTranslation()

  return (
    <AppSheet
      eyebrow={eyebrow}
      title={name}
      closeLabel={t('common.close')}
      onClose={onClose}
      actions={
        <>
          <SheetAction tone="primary" onClick={onClose}>
            {t('common.done')}
          </SheetAction>
          <SheetAction tone="danger" onClick={onRemove}>
            {t('routine.form.blocks.removeExerciseAction')}
          </SheetAction>
        </>
      }
    >
      <div className={styles.sheetBody}>
        <div>
          <AppSegmented<ExerciseTracking>
            className={styles.segmented}
            label={t('routine.form.blocks.trackedAs')}
            options={trackingOptions(t)}
            value={entry.tracking}
            onChange={(tracking) => onChange({ tracking })}
          />
          <p className={styles.lead}>{t(trackingLeads[entry.tracking])}</p>
        </div>

        <div className={styles.rows}>
          {entry.tracking === 'sets' && (
            <>
              <AppPreferenceRow
                title={t('routine.form.blocks.sets')}
                control={
                  <AppStepper
                    label={t('routine.form.blocks.sets')}
                    value={entry.sets}
                    format={(sets) => String(sets)}
                    decreaseLabel={t('routine.form.blocks.setsDecrease', {
                      label: t('routine.form.blocks.sets'),
                    })}
                    increaseLabel={t('routine.form.blocks.setsIncrease', {
                      label: t('routine.form.blocks.sets'),
                    })}
                    min={minimumSets}
                    max={maximumSets}
                    onChange={(sets) => onChange({ sets })}
                  />
                }
              />
              {/* Zero is an answer: it turns the timer off for this occurrence
                  alone, wherever else the routine rests. */}
              <AppPreferenceRow
                title={t('routine.form.blocks.restSets')}
                body={t('routine.form.blocks.restBody')}
                control={
                  <AppDurationStepper
                    label={t('routine.form.blocks.restSets')}
                    value={entry.restSeconds}
                    onChange={(restSeconds) => onChange({ restSeconds })}
                  />
                }
              />
            </>
          )}

          {entry.tracking === 'timed' && (
            <AppPreferenceRow
              title={t('routine.form.blocks.heldFor')}
              control={
                <AppDurationStepper
                  label={t('routine.form.blocks.heldFor')}
                  value={entry.targetDurationSeconds}
                  onChange={(targetDurationSeconds) => onChange({ targetDurationSeconds })}
                />
              }
            />
          )}

          {entry.tracking === 'distance' && (
            <AppPreferenceRow
              title={t('routine.form.blocks.targetDistance')}
              body={t('routine.form.blocks.targetDistanceBody')}
              control={
                <AppStepper
                  label={t('routine.form.blocks.targetDistance')}
                  value={entry.targetDistanceMeters}
                  format={(meters) => formatDistanceIn(meters / 1000, distanceUnit)}
                  decreaseLabel={t('routine.form.blocks.distanceDecrease')}
                  increaseLabel={t('routine.form.blocks.distanceIncrease')}
                  // A hundred metres is a lap of the track; once past a
                  // kilometre, half of one is the next thing worth running.
                  step={distanceStepMeters(entry.targetDistanceMeters)}
                  min={minimumDistanceMeters}
                  max={maximumDistanceMeters}
                  onChange={(targetDistanceMeters) => onChange({ targetDistanceMeters })}
                />
              }
            />
          )}
        </div>
      </div>
    </AppSheet>
  )
}
