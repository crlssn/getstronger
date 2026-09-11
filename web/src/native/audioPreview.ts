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
import type { PaceTone } from '@/utils/pacing'

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
 * Sounds one of the two notes, as its own button on the settings screen asks.
 *
 * A note is the one thing a row of copy cannot describe, and which way round
 * the pair goes is what an athlete has to know before the first one arrives
 * mid-run — so each is offered under its own name and sounded on its own.
 *
 * On a run the notes follow the announcement volume and go quiet with it. The
 * example does not: one nobody can hear reads as a broken feature rather than
 * as a turned-down one.
 */
export const previewPaceTone = (tone: PaceTone, volume: AnnouncementVolume): void => {
  playTone(paceToneHertz[tone], paceToneVolume * (speechVolume(volume) || 1))
}
