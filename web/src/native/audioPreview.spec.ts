// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { hush, paceToneHertz, playTone, say } from '@/native/cueTone'
import { previewAnnouncement, previewIntervalCue, previewPaceTones } from './audioPreview'

vi.mock('@/native/cueTone', async (original) => ({
  ...(await original<typeof import('@/native/cueTone')>()),
  say: vi.fn(),
  playTone: vi.fn(),
  hush: vi.fn(),
}))

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

    expect(hush).toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith('Run for 2 minutes', 0.4, 'en')
  })

  // Silence is the example: turning the announcements off and hearing one
  // would say the opposite of what was chosen.
  test('says nothing when the announcements are off', () => {
    previewAnnouncement('Run for 2 minutes', 'off')

    expect(say).not.toHaveBeenCalled()
  })
})

describe('previewIntervalCue', () => {
  // The cue is its own setting, so muted announcements do not silence it —
  // the example has to be as loud as the cue itself will be.
  test('says the cue over muted announcements', () => {
    previewIntervalCue('10 seconds', 10, 'off')

    expect(say).toHaveBeenCalledWith('10 seconds', 1, 'en')
  })

  test('says nothing at no lead, which is the cue turned off', () => {
    previewIntervalCue('10 seconds', 0, 'full')

    expect(say).not.toHaveBeenCalled()
  })
})

describe('previewPaceTones', () => {
  // A beep says nothing on its own: an example that names each note is the
  // only one that teaches which way round they go.
  test('names each note and sounds it, faster first', () => {
    previewPaceTones('previous', 'full', 'Faster', 'Slower')

    expect(say).toHaveBeenCalledExactlyOnceWith('Faster', 1, 'en')
    vi.runAllTimers()
    expect(vi.mocked(playTone).mock.calls.map(([hertz]) => hertz)).toEqual([
      paceToneHertz.ahead,
      paceToneHertz.behind,
    ])
    expect(say).toHaveBeenLastCalledWith('Slower', 1, 'en')
  })

  // The notes follow the announcement volume on a run, but an example nobody
  // can hear says the feature is broken rather than that it is turned down.
  test('is heard even with the announcements turned off', () => {
    previewPaceTones('best', 'off', 'Faster', 'Slower')
    vi.runAllTimers()

    expect(playTone).toHaveBeenCalledTimes(2)
    expect(say).toHaveBeenCalledWith('Faster', 1, 'en')
  })

  test('sounds nothing for no comparison at all', () => {
    previewPaceTones('off', 'full', 'Faster', 'Slower')
    vi.runAllTimers()

    expect(playTone).not.toHaveBeenCalled()
    expect(say).not.toHaveBeenCalled()
  })
})
