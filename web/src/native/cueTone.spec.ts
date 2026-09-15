// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const tone = () => ({
  frequency: { value: 0 },
  connect: vi.fn(() => ({ connect: vi.fn() })),
  start: vi.fn(),
  stop: vi.fn(),
})

const volume = () => ({
  gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
})

/** One oscillator and one gain per beep, in the order they were asked for. */
const beeps = () => {
  const oscillators: ReturnType<typeof tone>[] = []
  const gains: ReturnType<typeof volume>[] = []
  return {
    oscillators,
    gains,
    createOscillator: () => {
      const made = tone()
      oscillators.push(made)
      return made
    },
    createGain: () => {
      const made = volume()
      gains.push(made)
      return made
    },
  }
}

// The module keeps one context for the tab, so each test gets its own copy of
// it rather than the one the test before opened.
const load = async () => import('./cueTone')

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playPaceTone', () => {
  test('taps twice, quietly and quickly, for an interval that is ahead', async () => {
    const played = beeps()
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        currentTime = 4
        resume = vi.fn()
        destination = {}
        createOscillator = played.createOscillator
        createGain = played.createGain
      },
    )

    ;(await load()).playPaceTone('ahead', 1)

    expect(played.oscillators).toHaveLength(2)
    expect(played.oscillators.map((each) => each.frequency.value)).toEqual([1320, 1320])
    // 70ms of note, 60ms of silence, then the second tap.
    expect(played.oscillators[0].start).toHaveBeenCalledWith(4)
    expect(played.oscillators[0].stop).toHaveBeenCalledWith(4.07)
    expect(played.oscillators[1].start).toHaveBeenCalledWith(4.13)
    expect(played.oscillators[1].stop).toHaveBeenCalledWith(4.2)
    // Softer than the level it is given: a pair carries without the volume a
    // single note was reaching for.
    for (const gain of played.gains) {
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.6, expect.any(Number))
    }
  })

  test('holds one long note for an interval that is behind', async () => {
    const played = beeps()
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        currentTime = 4
        resume = vi.fn()
        destination = {}
        createOscillator = played.createOscillator
        createGain = played.createGain
      },
    )

    ;(await load()).playPaceTone('behind', 1)

    expect(played.oscillators).toHaveLength(1)
    expect(played.oscillators[0].frequency.value).toBe(440)
    expect(played.oscillators[0].start).toHaveBeenCalledWith(4)
    expect(played.oscillators[0].stop).toHaveBeenCalledWith(4.6)
    // Held rather than decaying away: length is what says "slower", and a note
    // that fades out at once is over before it has said it.
    expect(played.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 4.01)
    expect(played.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(1, 4.59)
    expect(played.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4.6)
  })

  test('scales both notes by the level it is given', async () => {
    const played = beeps()
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        currentTime = 0
        resume = vi.fn()
        destination = {}
        createOscillator = played.createOscillator
        createGain = played.createGain
      },
    )
    const { playPaceTone, paceToneVolume } = await load()

    playPaceTone('behind', paceToneVolume)

    expect(played.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      paceToneVolume,
      expect.any(Number),
    )
  })

  // Autoplay policy hands back a suspended context, whose clock does not move
  // until it resumes — so a note scheduled against it is already in the past
  // by the time there is anything to hear it on, and is never heard at all.
  test('waits for a suspended context to resume before scheduling the note', async () => {
    const played = beeps()
    let resumed = () => {}
    const context = {
      state: 'suspended',
      currentTime: 0,
      resume: vi.fn(
        () =>
          new Promise<void>((settle) => {
            resumed = () => {
              context.state = 'running'
              context.currentTime = 9
              settle()
            }
          }),
      ),
      destination: {},
      createOscillator: played.createOscillator,
      createGain: played.createGain,
    }
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          return context
        }
      },
    )

    ;(await load()).playPaceTone('behind', 1)
    expect(played.oscillators).toHaveLength(0)

    resumed()
    await vi.waitFor(() => expect(played.oscillators).toHaveLength(1))
    expect(played.oscillators[0].start).toHaveBeenCalledWith(9)
    expect(played.oscillators[0].stop).toHaveBeenCalledWith(9.6)
  })

  // A browser that will not open an audio context is still recording, and the
  // note is the one thing it goes without.
  test('records on in silence when the browser refuses a context', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('not allowed')
        }
      },
    )
    const { playPaceTone } = await load()

    expect(() => playPaceTone('behind', 1)).not.toThrow()
  })
})

describe('say', () => {
  test('speaks the phrase at the volume it is given', async () => {
    const speak = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak, getVoices: () => [] })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        volume = 1
        lang = ''
        constructor(public text: string) {}
      },
    )

    ;(await load()).say('10 seconds', 0.5, 'en')

    // Closed off with a full stop, so the synthesiser falls away at the end of
    // it rather than clipping the last word.
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: '10 seconds.', volume: 0.5, lang: 'en-GB' }),
    )
  })

  // There is no pause in the web speech API and queued utterances run straight
  // into one another, so the second half waits on a timer of its own.
  test('holds a phrase that asks for a pause, and says the rest after it', async () => {
    const spoken: { text: string; onend?: () => void }[] = []
    vi.stubGlobal('speechSynthesis', {
      speak: (utterance: { text: string }) => spoken.push(utterance),
      getVoices: () => [],
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        volume = 1
        lang = ''
        onend?: () => void
        constructor(public text: string) {}
      },
    )
    vi.useFakeTimers()
    const { say } = await load()
    const { announcementPauseSeconds } = await import('./announcementVoice')

    say('Half way.{pause}5 minutes per kilometre', 1, 'en')
    expect(spoken.map((each) => each.text)).toEqual(['Half way.'])

    spoken[0].onend?.()
    vi.advanceTimersByTime(announcementPauseSeconds * 1000 - 1)
    expect(spoken).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(spoken.map((each) => each.text)).toEqual(['Half way.', '5 minutes per kilometre.'])
    vi.useRealTimers()
  })

  // "Half way" without the pace is the half worth less, so a part the browser
  // gives up on must not swallow the rest of the phrase.
  test('carries on to the rest of a phrase when a part errors', async () => {
    const spoken: { text: string; onerror?: () => void }[] = []
    vi.stubGlobal('speechSynthesis', {
      speak: (utterance: { text: string }) => spoken.push(utterance),
      getVoices: () => [],
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        volume = 1
        lang = ''
        onerror?: () => void
        constructor(public text: string) {}
      },
    )
    vi.useFakeTimers()
    const { say } = await load()

    say('Half way.{pause}5 minutes per kilometre', 1, 'en')
    spoken[0].onerror?.()
    vi.advanceTimersByTime(1000)

    expect(spoken.map((each) => each.text)).toEqual(['Half way.', '5 minutes per kilometre.'])
    vi.useRealTimers()
  })

  test('says nothing at no volume, and nothing where the browser cannot speak', async () => {
    const speak = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak, getVoices: () => [] })
    vi.stubGlobal('SpeechSynthesisUtterance', class {})
    const { say } = await load()

    say('Workout completed', 0, 'en')
    expect(speak).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    expect(() => say('Workout completed', 1, 'en')).not.toThrow()
  })
})
