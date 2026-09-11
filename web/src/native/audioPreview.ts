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
import { speechVolume, type AnnouncementVolume } from '@/stores/announcements'
import type { PaceReferenceChoice } from '@/utils/pacing'

/** Long enough for the first note to finish before the second answers it. */
const betweenNotesMs = 450

/** Says the sample at the level just chosen; off is demonstrated by silence. */
export const previewAnnouncement = (phrase: string, volume: AnnouncementVolume): void => {
  hush()
  const level = speechVolume(volume)
  if (level <= 0) return
  say(phrase, level)
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
  say(phrase, speechVolume(volume) || 1)
}

/**
 * Sounds both notes, ahead then behind, so the pair is heard as a pair.
 *
 * They follow the announcement volume, as they do on a run: with the
 * announcements off there is nothing to hear, which is the honest example.
 */
export const previewPaceTones = (choice: PaceReferenceChoice, volume: AnnouncementVolume): void => {
  const level = paceToneVolume * speechVolume(volume)
  if (choice === 'off' || level <= 0) return
  playTone(paceToneHertz.ahead, level)
  setTimeout(() => playTone(paceToneHertz.behind, level), betweenNotesMs)
}
