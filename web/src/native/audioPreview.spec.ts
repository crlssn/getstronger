// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { hush, paceToneHertz, paceToneVolume, playTone, say } from '@/native/cueTone'
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
    expect(say).toHaveBeenCalledWith('Run for 2 minutes', 0.4)
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

    expect(say).toHaveBeenCalledWith('10 seconds', 1)
  })

  test('says nothing at no lead, which is the cue turned off', () => {
    previewIntervalCue('10 seconds', 0, 'full')

    expect(say).not.toHaveBeenCalled()
  })
})

describe('previewPaceTones', () => {
  test('sounds both notes, one after the other, at the announcement volume', () => {
    previewPaceTones('previous', 'full')

    expect(playTone).toHaveBeenCalledExactlyOnceWith(paceToneHertz.ahead, paceToneVolume)
    vi.runAllTimers()
    expect(playTone).toHaveBeenLastCalledWith(paceToneHertz.behind, paceToneVolume)
  })

  test('sounds nothing for no comparison, and nothing with the announcements off', () => {
    previewPaceTones('off', 'full')
    previewPaceTones('best', 'off')
    vi.runAllTimers()

    expect(playTone).not.toHaveBeenCalled()
  })
})
