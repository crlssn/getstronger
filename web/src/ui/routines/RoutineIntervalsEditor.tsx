import type { DraftGroup } from '@/utils/routineGroups'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { AppPreferenceRow } from '@/ui/components/AppPreferenceRow'
import { AppStepper } from '@/ui/components/AppStepper'
import { AppSwitch } from '@/ui/components/AppSwitch'
import { GroupEntries } from '@/ui/routines/RoutineGroupsEditor'
import {
  intervalPartBadge,
  intervalPartNote,
  intervalPartTitle,
} from '@/ui/routines/intervalParts'
import { cn } from '@/ui/cn'
import {
  intervalCount,
  intervalRoles,
  intervalSeconds,
  maximumRounds,
  withGroup,
} from '@/utils/routineGroups'
import styles from './RoutineIntervalsEditor.module.css'

interface Props {
  groups: DraftGroup[]
  /** Names come from the routine and from the picker, so nothing is fetched here. */
  nameOf: (exerciseId: string) => string
  onChange: (groups: DraftGroup[]) => void
  onAddExercise: (groupId: string) => void
}

/** A minimum of one round: a part worked no times is a part that is not there. */
const minimumRounds = 1

/**
 * An interval routine: a warm-up, one block repeated, and a cool-down.
 *
 * The shape is fixed, so the parts are not added or removed — a session that
 * wants blocks of its own choosing is a grouped routine, and this screen never
 * pretends otherwise. What the athlete sets is which exercises are in each
 * part, how long each is held, and how many times the middle one goes round.
 */
export const RoutineIntervalsEditor = ({ groups, nameOf, onChange, onAddExercise }: Props) => {
  const { t, i18n } = useTranslation()

  const repeat = groups.find((group) => group.role === 'repeat')
  const rounds = repeat?.rounds ?? minimumRounds
  const names = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' })

  return (
    <>
      {intervalRoles.map((role) => {
        const group = groups.find((candidate) => candidate.role === role)
        if (!group) return null

        const repeating = role === 'repeat'
        // The switch changes the last exercise of the block into one the final
        // round leaves out, so it has nothing to say until there are two.
        const skippable = repeating && group.entries.length > 1
        const dropped = nameOf(group.entries.at(-1)?.exerciseId ?? '')
        const kept = nameOf(group.entries.at(-2)?.exerciseId ?? '')

        return (
          <section key={role} className={styles.part}>
            <header className={styles.partHeader}>
              <span
                className={cn(styles.partBadge, repeating && styles.roundBadge)}
                aria-hidden="true"
              >
                {t(intervalPartBadge[role], { count: rounds })}
              </span>
              <strong className={styles.partTitle}>{t(intervalPartTitle[role])}</strong>
              <span className={styles.partNote}>{t(intervalPartNote[role], { count: rounds })}</span>
            </header>

            <div className={styles.partCard}>
              {repeating && (
                <AppPreferenceRow
                  title={t('routine.form.groups.rounds')}
                  body={
                    group.entries.length
                      ? t('routine.form.intervals.roundsBody', {
                          count: rounds,
                          names: names.format(
                            group.entries.map((entry) => nameOf(entry.exerciseId)),
                          ),
                        })
                      : t('routine.form.intervals.roundsEmpty')
                  }
                  control={
                    <AppStepper
                      label={t('routine.form.groups.rounds')}
                      value={rounds}
                      min={minimumRounds}
                      max={maximumRounds}
                      format={(value) => String(value)}
                      decreaseLabel={t('routine.form.groups.roundsDecrease', {
                        label: t('routine.form.groups.rounds'),
                      })}
                      increaseLabel={t('routine.form.groups.roundsIncrease', {
                        label: t('routine.form.groups.rounds'),
                      })}
                      onChange={(value) => onChange(withGroup(groups, group.id, { rounds: value }))}
                    />
                  }
                />
              )}

              <GroupEntries
                groups={groups}
                group={group}
                // An interval is held for the time it says and the next one
                // starts: in a session like this the easy interval is the rest.
                restBetweenSets={false}
                nameOf={nameOf}
                onChange={onChange}
              />

              <div className={styles.partActions}>
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

              {skippable && (
                <AppPreferenceRow
                  className={styles.skip}
                  title={t('routine.form.intervals.skip')}
                  body={
                    group.skipLastOnFinalRound
                      ? t('routine.form.intervals.skipOn', { name: kept, dropped })
                      : t('routine.form.intervals.skipOff')
                  }
                  control={
                    <AppSwitch
                      checked={group.skipLastOnFinalRound}
                      label={t('routine.form.intervals.skip')}
                      onChange={(skipLastOnFinalRound) =>
                        onChange(withGroup(groups, group.id, { skipLastOnFinalRound }))
                      }
                    />
                  }
                />
              )}
            </div>
          </section>
        )
      })}

      {/* What the parts add up to: the one place the whole session is a number. */}
      <p className={styles.plan}>
        <span>
          {t('routine.form.intervals.planned', {
            count: Math.round(intervalSeconds(groups) / 60),
          })}
        </span>
        <span>{t('routine.form.intervals.count', { count: intervalCount(groups) })}</span>
      </p>
    </>
  )
}
