import type { GroupRole } from '@/utils/routineGroups'

type IntervalRole = Exclude<GroupRole, ''>

/** What each part of an interval routine is called. */
export const intervalPartTitle: Record<IntervalRole, string> = {
  warmup: 'routine.form.intervals.warmup',
  repeat: 'routine.form.intervals.repeat',
  cooldown: 'routine.form.intervals.cooldown',
}

/** The line beside the title that says when the part is worked. */
export const intervalPartNote: Record<IntervalRole, string> = {
  warmup: 'routine.form.intervals.warmupNote',
  repeat: 'routine.form.intervals.repeatNote',
  cooldown: 'routine.form.intervals.cooldownNote',
}

/** The letter in the badge; the repeating block carries its round count instead. */
export const intervalPartBadge: Record<IntervalRole, string> = {
  warmup: 'routine.form.intervals.warmupBadge',
  repeat: 'routine.form.intervals.repeatBadge',
  cooldown: 'routine.form.intervals.cooldownBadge',
}
