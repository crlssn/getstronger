import { describe, expect, test, vi } from 'vitest'

import { playRestFinishedSound } from '@/utils/restSound'

const createAudioContext = (state: AudioContextState = 'running') => {
  const oscillators: Array<{
    frequency: { exponentialRampToValueAtTime: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn> }
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    type: OscillatorType
  }> = []

  const context = {
    currentTime: 10,
    destination: {},
    state,
    createGain: () => ({
      connect: vi.fn().mockReturnValue(undefined),
      gain: {
        exponentialRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    }),
    createOscillator: () => {
      const oscillator = {
        connect: vi.fn().mockReturnValue({ connect: vi.fn() }),
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

  return { context, oscillators }
}

describe('playRestFinishedSound', () => {
  test('plays a rising five-tone fanfare with a held final chord', () => {
    const { context, oscillators } = createAudioContext()

    playRestFinishedSound(context)

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

  test('stays silent until the browser audio context is running', () => {
    const { context, oscillators } = createAudioContext('suspended')

    playRestFinishedSound(context)

    expect(oscillators).toHaveLength(0)
  })
})
