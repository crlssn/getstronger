// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { paceToneHertz, playTone } from '@/native/cueTone'
import { timedCircuit } from '@/native/timedCircuit'
import { previewAnnouncement, previewIntervalCue, previewPaceTones } from './audioPreview'

vi.mock('@/native/cueTone', async (original) => ({
  ...(await original<typeof import('@/native/cueTone')>()),
  playTone: vi.fn(),
}))

// The example goes through the recorder, which is what knows the voice a run
// is announced in; Capacitor answers with the phone's plugin where there is one.
vi.mock('@/native/timedCircuit', () => ({
  timedCircuit: { speak: vi.fn(() => Promise.resolve()) },
}))

const spoken = () =>
  vi.mocked(timedCircuit.speak).mock.calls.map(([{ phrase, volume }]) => [phrase, volume])

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('previewAnnouncement', () => {
  test('says the sample at the level just picked', () => {
    previewAnnouncement('Run for 2 minutes', 'low')

    expect(timedCircuit.speak).toHaveBeenCalledExactlyOnceWith({
      phrase: 'Run for 2 minutes',
      volume: 0.4,
      locale: 'en',
    })
  })

  // Silence is the example: turning the announcements off and hearing one
  // would say the opposite of what was chosen.
  test('says nothing when the announcements are off', () => {
    previewAnnouncement('Run for 2 minutes', 'off')

    expect(timedCircuit.speak).not.toHaveBeenCalled()
  })
})

describe('previewIntervalCue', () => {
  // The cue is its own setting, so muted announcements do not silence it —
  // the example has to be as loud as the cue itself will be.
  test('says the cue over muted announcements', () => {
    previewIntervalCue('10 seconds', 10, 'off')

    expect(spoken()).toEqual([['10 seconds', 1]])
  })

  test('says nothing at no lead, which is the cue turned off', () => {
    previewIntervalCue('10 seconds', 0, 'full')

    expect(timedCircuit.speak).not.toHaveBeenCalled()
  })
})

describe('previewPaceTones', () => {
  // A beep says nothing on its own: an example that names each note is the
  // only one that teaches which way round they go.
  test('names each note and sounds it, faster first', () => {
    previewPaceTones('previous', 'full', 'Faster', 'Slower')

    expect(spoken()).toEqual([['Faster', 1]])
    vi.runAllTimers()
    expect(vi.mocked(playTone).mock.calls.map(([hertz]) => hertz)).toEqual([
      paceToneHertz.ahead,
      paceToneHertz.behind,
    ])
    expect(spoken()).toEqual([
      ['Faster', 1],
      ['Slower', 1],
    ])
  })

  // The notes follow the announcement volume on a run, but an example nobody
  // can hear says the feature is broken rather than that it is turned down.
  test('is heard even with the announcements turned off', () => {
    previewPaceTones('best', 'off', 'Faster', 'Slower')
    vi.runAllTimers()

    expect(playTone).toHaveBeenCalledTimes(2)
    expect(spoken()).toContainEqual(['Faster', 1])
  })

  test('sounds nothing for no comparison at all', () => {
    previewPaceTones('off', 'full', 'Faster', 'Slower')
    vi.runAllTimers()

    expect(playTone).not.toHaveBeenCalled()
    expect(timedCircuit.speak).not.toHaveBeenCalled()
  })
})
