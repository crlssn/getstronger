/**
 * Which of the browser's voices says a cue, and how the cue is closed off.
 *
 * The phones rank the voices installed on them — `AnnouncementVoice.swift`,
 * the package the iOS app compiles in — because the one a synthesiser picks by
 * default is the flattest one it has. A browser ranks worse still: it says an
 * example in whatever voice its page language suggests, so a Swedish cue is
 * read out in English. This is the same ranking against what a browser will
 * tell us about a voice, which is its name, its language and whether it is
 * shipped or fetched.
 */

/**
 * The regions the app has already chosen for the languages it speaks,
 * mirroring `dateLocale()` in `web/src/i18n/index.ts`. Voices come per region,
 * and the web app knows only a language.
 */
const regions: Record<string, string> = { en: 'en-GB', sv: 'sv-SE' }

/** The locale a cue is spoken in: a bare language is given the app's region. */
export const announcementLocale = (locale: string): string =>
  regions[locale.toLowerCase()] ?? locale

/** The language a locale names, with its region and its case dropped. */
const language = (locale: string) => locale.toLowerCase().split('-')[0]

/**
 * How natural a voice sounds, worst first, read off the two things a browser
 * says about it.
 *
 * There is no quality field in the web API, so the name carries it: Safari and
 * the phones' WebViews mark theirs `(Enhanced)` or `(Premium)`. Chrome marks
 * nothing and ships the flat ones locally, fetching the natural ones — so a
 * voice the browser has to go and get is the better of two otherwise alike.
 */
const quality = (voice: SpeechSynthesisVoice): number => {
  const name = voice.name.toLowerCase()
  if (name.includes('premium')) return 2
  if (/enhanced|neural|natural/.test(name)) return 1
  return voice.localService ? 0 : 1
}

/** Where a voice stands, best last: the app's own region first, then quality. */
const rank = (voice: SpeechSynthesisVoice, locale: string): [number, number] => [
  voice.lang.toLowerCase().replace('_', '-') === locale.toLowerCase() ? 1 : 0,
  quality(voice),
]

/**
 * The best-sounding voice for `locale`, or nothing where none of them beats
 * what the browser would have picked on its own.
 *
 * Only an upgrade is ever reported, so a browser carrying nothing but its
 * ordinary voices keeps the one it already speaks in.
 */
export const bestVoice = (
  locale: string,
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined => {
  const wanted = announcementLocale(locale)
  const candidates = voices.filter(
    (voice) => quality(voice) > 0 && language(voice.lang.replace('_', '-')) === language(wanted),
  )
  // Ties settle on the name, so a browser offered two equals always speaks in
  // the same one rather than a different one on every tap.
  return candidates.reduce<SpeechSynthesisVoice | undefined>((best, voice) => {
    if (!best) return voice
    const [region, sound] = rank(voice, wanted)
    const [bestRegion, bestSound] = rank(best, wanted)
    if (region !== bestRegion) return region > bestRegion ? voice : best
    if (sound !== bestSound) return sound > bestSound ? voice : best
    return voice.name < best.name ? voice : best
  }, undefined)
}

/**
 * A cue closed off with a full stop, which is what makes a synthesiser fall
 * away at the end of it instead of clipping the last word.
 */
export const announcementPhrase = (instruction: string): string => {
  const cue = instruction.trim()
  const last = cue.at(-1)
  return !last || '.!?,:;'.includes(last) ? cue : `${cue}.`
}
