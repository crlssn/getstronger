/**
 * What a sound setting sounds like, played the moment it is chosen.
 *
 * Every one of these settings is heard on a run and nowhere else, so a picker
 * that only reads back a word asks the athlete to remember what it means until
 * the next session. Each row plays its own answer instead.
 *
 * The answer goes through the recorder rather than through the page, because
 * the recorder is what knows which voice a run is announced in. A WebView is
 * handed a different set of voices from the app around it — on iOS, an empty
 * one — so an example the page said itself was never the voice being chosen.
 */

import { paceToneHertz, paceToneVolume, playTone } from '@/native/cueTone'
import { timedCircuit } from '@/native/timedCircuit'
import { i18n } from '@/i18n'
import { speechVolume, type AnnouncementVolume } from '@/stores/announcements'
import type { PaceReferenceChoice } from '@/utils/pacing'

/** Long enough for the word to be out before the note it names sounds. */
const afterWordMs = 900

/** And long enough for that pair to land before the other one answers it. */
const betweenPairsMs = 1700

/** Says a phrase in the voice a run is announced in, and drops anything before it. */
const speak = (phrase: string, volume: number) => {
  void timedCircuit.speak({ phrase, volume, locale: i18n.language }).catch(() => {
    // A device that will not speak still has the setting; the example is the
    // one thing it goes without.
  })
}

/** Says the sample at the level just chosen; off is demonstrated by silence. */
export const previewAnnouncement = (phrase: string, volume: AnnouncementVolume): void => {
  const level = speechVolume(volume)
  if (level <= 0) return
  speak(phrase, level)
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
  if (leadSeconds <= 0) return
  speak(phrase, speechVolume(volume) || 1)
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
  if (!enabled) return
  speak(phrase, speechVolume(volume) || 1)
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
  if (choice === 'off') return
  const spoken = speechVolume(volume) || 1
  const level = paceToneVolume * spoken
  speak(faster, spoken)
  setTimeout(() => playTone(paceToneHertz.ahead, level), afterWordMs)
  setTimeout(() => speak(slower, spoken), betweenPairsMs)
  setTimeout(() => playTone(paceToneHertz.behind, level), betweenPairsMs + afterWordMs)
}
