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

// The module keeps one context for the tab, so each test gets its own copy of
// it rather than the one the test before opened.
const load = async () => import('./cueTone')

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playTone', () => {
  test('sounds a short note, ramped so it does not click', async () => {
    const oscillator = tone()
    const gain = volume()
    const resume = vi.fn()
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        currentTime = 4
        resume = resume
        destination = {}
        createOscillator = () => oscillator
        createGain = () => gain
      },
    )

    ;(await load()).playTone(1320)

    expect(oscillator.frequency.value).toBe(1320)
    expect(oscillator.start).toHaveBeenCalledWith(4)
    expect(oscillator.stop).toHaveBeenCalledWith(4.2)
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4.2)
    // A context already awake is not woken again: resuming is what the test
    // below covers, and it is the suspended case that has to wait for it.
    expect(resume).not.toHaveBeenCalled()
  })

  // Autoplay policy hands back a suspended context, whose clock does not move
  // until it resumes — so a note scheduled against it is already in the past
  // by the time there is anything to hear it on, and is never heard at all.
  test('waits for a suspended context to resume before scheduling the note', async () => {
    const oscillator = tone()
    const gain = volume()
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
      createOscillator: () => oscillator,
      createGain: () => gain,
    }
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          return context
        }
      },
    )

    ;(await load()).playTone(1320)
    expect(oscillator.start).not.toHaveBeenCalled()

    resumed()
    await vi.waitFor(() => expect(oscillator.start).toHaveBeenCalledWith(9))
    expect(oscillator.stop).toHaveBeenCalledWith(9.2)
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
    const { playTone } = await load()

    expect(() => playTone(440)).not.toThrow()
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
