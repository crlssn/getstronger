// @vitest-environment jsdom

import { describe, expect, test } from 'vitest'

import { announcementLocale, announcementPhrase, bestVoice } from './announcementVoice'

const voice = (name: string, lang: string, localService = true): SpeechSynthesisVoice => ({
  name,
  lang,
  localService,
  default: false,
  voiceURI: name,
})

describe('announcementLocale', () => {
  test('gives a bare language the region the app already reads dates in', () => {
    expect(announcementLocale('en')).toBe('en-GB')
    expect(announcementLocale('sv')).toBe('sv-SE')
    // Anything already carrying a region is taken as it stands.
    expect(announcementLocale('en-AU')).toBe('en-AU')
  })
})

describe('bestVoice', () => {
  // An enhanced British voice is a better cue than a premium American one:
  // the app has already chosen the region everything else is read in.
  test("prefers the app's own region, then the more natural voice", () => {
    const british = voice('Daniel (Enhanced)', 'en-GB')
    const american = voice('Samantha (Premium)', 'en-US')

    expect(bestVoice('en', [american, british])).toBe(british)
    expect(bestVoice('en', [american, voice('Daniel', 'en-GB')])).toBe(american)
  })

  // A browser that fetches a voice rather than shipping it is offering the
  // natural-sounding one, which is how Chrome's Google voices are told apart.
  test('reads a fetched voice as the better of two with nothing in their names', () => {
    const fetched = voice('Google UK English Female', 'en-GB', false)
    const shipped = voice('Daniel', 'en-GB')

    expect(bestVoice('en', [shipped, fetched])).toBe(fetched)
  })

  // Only an upgrade is ever reported, so a browser carrying nothing but its
  // ordinary voices keeps whichever one it would have picked itself.
  test('reports nothing where no voice beats the ordinary ones, or the language is absent', () => {
    expect(bestVoice('en', [voice('Daniel', 'en-GB'), voice('Alex', 'en-US')])).toBeUndefined()
    expect(bestVoice('sv', [voice('Daniel (Premium)', 'en-GB')])).toBeUndefined()
  })

  // Two equals have to settle the same way every time, or the same setting
  // speaks in a different voice on every tap.
  test('settles a tie the same way every time', () => {
    const alfa = voice('Alfa (Enhanced)', 'sv-SE')
    const beta = voice('Beta (Enhanced)', 'sv-SE')

    expect(bestVoice('sv', [alfa, beta])).toBe(bestVoice('sv', [beta, alfa]))
  })
})

describe('announcementPhrase', () => {
  // The synthesiser falls away at a full stop instead of clipping the last word.
  test('closes a phrase off, and leaves one that already is', () => {
    expect(announcementPhrase('10 seconds')).toBe('10 seconds.')
    expect(announcementPhrase('Half way. Pace 5:00 per kilometre')).toBe(
      'Half way. Pace 5:00 per kilometre.',
    )
    expect(announcementPhrase('Workout completed!')).toBe('Workout completed!')
    expect(announcementPhrase('  Run for 2 minutes  ')).toBe('Run for 2 minutes.')
  })
})
