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
const load = async () => (await import('./cueTone')).playCue

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playCue', () => {
  test('sounds a short tone, ramped so it does not click', async () => {
    const oscillator = tone()
    const gain = volume()
    const resume = vi.fn()
    vi.stubGlobal(
      'AudioContext',
      class {
        currentTime = 4
        resume = resume
        destination = {}
        createOscillator = () => oscillator
        createGain = () => gain
      },
    )

    ;(await load())()

    expect(oscillator.frequency.value).toBe(880)
    expect(oscillator.start).toHaveBeenCalledWith(4)
    expect(oscillator.stop).toHaveBeenCalledWith(4.2)
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4.2)
    // Autoplay policy suspends a context opened before the first gesture.
    expect(resume).toHaveBeenCalled()
  })

  // A browser that will not open an audio context is still recording, and the
  // cue is the one thing it goes without.
  test('records on in silence when the browser refuses a context', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('not allowed')
        }
      },
    )
    const playCue = await load()

    expect(() => playCue()).not.toThrow()
  })
})
