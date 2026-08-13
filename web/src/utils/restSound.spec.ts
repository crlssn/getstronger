import { describe, expect, test, vi } from 'vitest'

import {
  playRestFinishedSound,
  playRestGetReadySound,
  shouldPlayRestGetReadySound,
  unlockRestSound,
} from '@/utils/restSound'

const createAudioContext = (initialState: AudioContextState = 'running') => {
  let state = initialState
  const oscillators: Array<{
    frequency: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
      setValueAtTime: ReturnType<typeof vi.fn>
    }
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    type: OscillatorType
  }> = []
  const gains: Array<{
    connect: ReturnType<typeof vi.fn>
    gain: {
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
      setValueAtTime: ReturnType<typeof vi.fn>
    }
  }> = []
  const resume = vi.fn(async () => {
    state = 'running'
  })

  const context = {
    currentTime: 10,
    destination: {},
    get state() {
      return state
    },
    resume,
    createGain: () => {
      const gain = {
        connect: vi.fn(),
        gain: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
      }
      gains.push(gain)
      return gain
    },
    createOscillator: () => {
      const oscillator = {
        connect: vi.fn(),
        frequency: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
        start: vi.fn(),
        stop: vi.fn(),
        type: 'sine' as OscillatorType,
      }
      oscillators.push(oscillator)
      return oscillator
    },
  } as unknown as AudioContext

  return { context, gains, oscillators, resume }
}

describe('rest sounds', () => {
  test('unlocks suspended mobile audio during a user interaction', async () => {
    const { context, gains, oscillators, resume } = createAudioContext('suspended')

    await expect(unlockRestSound(context)).resolves.toBe(true)

    expect(resume).toHaveBeenCalledOnce()
    expect(oscillators).toHaveLength(1)
    expect(gains).toHaveLength(1)
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.01)
  })

  test('plays a two-note get-ready cue', async () => {
    const { context, oscillators } = createAudioContext()

    await expect(playRestGetReadySound(context)).resolves.toBe(true)

    expect(
      oscillators.map(({ frequency }) => frequency.exponentialRampToValueAtTime.mock.calls[0][0]),
    ).toEqual([440, 659.25])
    expect(oscillators.map(({ start }) => start.mock.calls[0][0])).toEqual([10, 10.14])
  })

  test('plays a rising five-tone completion fanfare after resuming audio', async () => {
    const { context, oscillators, resume } = createAudioContext('suspended')

    await expect(playRestFinishedSound(context)).resolves.toBe(true)

    expect(resume).toHaveBeenCalledOnce()
    expect(oscillators).toHaveLength(5)
    expect(oscillators.every(({ type }) => type === 'triangle')).toBe(true)
    expect(
      oscillators.map(({ frequency }) => frequency.exponentialRampToValueAtTime.mock.calls[0][0]),
    ).toEqual([392, 493.88, 587.33, 783.99, 987.77])
    expect(oscillators.map(({ start }) => start.mock.calls[0][0])).toEqual([
      10, 10.12, 10.24, 10.38, 10.38,
    ])
    expect(oscillators[oscillators.length - 1]?.stop).toHaveBeenCalledWith(10.82)
  })

  test('only requests the get-ready cue once in the final ten seconds', () => {
    expect(shouldPlayRestGetReadySound(11, false)).toBe(false)
    expect(shouldPlayRestGetReadySound(10, false)).toBe(true)
    expect(shouldPlayRestGetReadySound(1, false)).toBe(true)
    expect(shouldPlayRestGetReadySound(10, true)).toBe(false)
    expect(shouldPlayRestGetReadySound(0, false)).toBe(false)
  })
})
