/**
 * What a sound setting sounds like, played the moment it is chosen.
 *
 * Every one of these settings is heard on a run and nowhere else, so a picker
 * that only reads back a word asks the athlete to remember what it means until
 * the next session. Each row plays its own answer instead, in the browser's
 * voice: the phones speak their own on a locked screen, and this is close
 * enough to choose by.
 */

import { hush, paceToneHertz, paceToneVolume, playTone, say } from '@/native/cueTone'
import { i18n } from '@/i18n'
import { speechVolume, type AnnouncementVolume } from '@/stores/announcements'
import type { PaceReferenceChoice } from '@/utils/pacing'

/** Long enough for the word to be out before the note it names sounds. */
const afterWordMs = 900

/** And long enough for that pair to land before the other one answers it. */
const betweenPairsMs = 1700

/** Says the sample at the level just chosen; off is demonstrated by silence. */
export const previewAnnouncement = (phrase: string, volume: AnnouncementVolume): void => {
  hush()
  const level = speechVolume(volume)
  if (level <= 0) return
  say(phrase, level, i18n.language)
}

/**
 * Says the cue at the lead just chosen, and nothing at no lead.
 *
 * The cue is its own setting, so muted announcements do not silence it: the
 * example is as loud as the cue itself will be.
 */
export const previewIntervalCue = (
  phrase: string,
  leadSeconds: number,
  volume: AnnouncementVolume,
): void => {
  hush()
  if (leadSeconds <= 0) return
  say(phrase, speechVolume(volume) || 1, i18n.language)
}

/**
 * Says the half-way call at an example pace, and nothing while it is off.
 *
 * Like the interval cue it is a setting of its own, so muted announcements do
 * not silence it and the example is as loud as the call itself will be.
 */
export const previewHalfway = (
  phrase: string,
  enabled: boolean,
  volume: AnnouncementVolume,
): void => {
  hush()
  if (!enabled) return
  say(phrase, speechVolume(volume) || 1, i18n.language)
}

/**
 * Says what each note means and then sounds it, faster first.
 *
 * A beep says nothing on its own, and the pair is the whole point: which way
 * round they go is what an athlete has to know before the first one arrives
 * mid-run. So the example names them rather than leaving two tones to be
 * worked out.
 *
 * On a run the notes follow the announcement volume and go quiet with it. The
 * example does not: one nobody can hear reads as a broken feature rather than
 * as a turned-down one.
 */
export const previewPaceTones = (
  choice: PaceReferenceChoice,
  volume: AnnouncementVolume,
  faster: string,
  slower: string,
): void => {
  hush()
  if (choice === 'off') return
  const spoken = speechVolume(volume) || 1
  const level = paceToneVolume * spoken
  say(faster, spoken, i18n.language)
  setTimeout(() => playTone(paceToneHertz.ahead, level), afterWordMs)
  setTimeout(() => say(slower, spoken, i18n.language), betweenPairsMs)
  setTimeout(() => playTone(paceToneHertz.behind, level), betweenPairsMs + afterWordMs)
}
