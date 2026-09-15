// @vitest-environment jsdom

import { Capacitor } from '@capacitor/core'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { paceToneVolume, playPaceTone } from '@/native/cueTone'
import { timedCircuit } from '@/native/timedCircuit'
import { previewAnnouncement, previewIntervalCue, previewPaceTone } from './audioPreview'

vi.mock('@capacitor/core', async (original) => {
  const core = await original<typeof import('@capacitor/core')>()
  return { ...core, Capacitor: { ...core.Capacitor, getPlatform: vi.fn(() => 'web') } }
})

vi.mock('@/native/cueTone', async (original) => ({
  ...(await original<typeof import('@/native/cueTone')>()),
  playPaceTone: vi.fn(),
}))

// The example goes through the recorder, which is what knows the voice a run
// is announced in; Capacitor answers with the phone's plugin where there is one.
vi.mock('@/native/timedCircuit', () => ({
  timedCircuit: {
    speak: vi.fn(() => Promise.resolve()),
    previewTone: vi.fn(() => Promise.resolve()),
  },
}))

const spoken = () =>
  vi.mocked(timedCircuit.speak).mock.calls.map(([{ phrase, volume }]) => [phrase, volume])

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(Capacitor.getPlatform).mockReturnValue('web')
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

describe('previewPaceTone', () => {
  // Both phones own the audio a note goes out on, and the WebView cannot
  // reach it: iOS silences a page's note with the Ring/Silent switch, and
  // Android sends it out on a stream of the WebView's choosing.
  test.each(['ios', 'android'] as const)('sounds the note through the recorder on %s', (phone) => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue(phone)

    previewPaceTone('ahead', 'full')

    // The announcements' level alone: each recorder puts its own tone level
    // under it, so the example is as loud as the note a run plays.
    expect(timedCircuit.previewTone).toHaveBeenCalledExactlyOnceWith({
      tone: 'ahead',
      volume: 1,
    })
    expect(playPaceTone).not.toHaveBeenCalled()
    expect(timedCircuit.speak).not.toHaveBeenCalled()
  })

  test('says which note, and at the level just chosen', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')

    previewPaceTone('behind', 'low')

    expect(timedCircuit.previewTone).toHaveBeenCalledExactlyOnceWith({
      tone: 'behind',
      volume: 0.4,
    })
  })

  // A phone that will not sound it stays silent rather than falling back to
  // the WebView's audio, which is the thing being avoided.
  test('does not fall back to the page when the phone refuses', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
    vi.mocked(timedCircuit.previewTone).mockRejectedValueOnce(new Error('no audio'))

    expect(() => previewPaceTone('ahead', 'full')).not.toThrow()
    await vi.waitFor(() => expect(timedCircuit.previewTone).toHaveBeenCalledOnce())
    expect(playPaceTone).not.toHaveBeenCalled()
  })

  // A browser has only the one audio session, and this is what the recorder
  // there already plays through.
  test('sounds the note itself in a browser', () => {
    previewPaceTone('ahead', 'full')
    expect(playPaceTone).toHaveBeenCalledExactlyOnceWith('ahead', paceToneVolume)

    previewPaceTone('behind', 'full')
    expect(playPaceTone).toHaveBeenLastCalledWith('behind', paceToneVolume)
  })

  // The notes follow the announcement volume on a run, but an example nobody
  // can hear says the feature is broken rather than that it is turned down.
  test('is heard even with the announcements turned off', () => {
    previewPaceTone('ahead', 'off')

    expect(playPaceTone).toHaveBeenCalledExactlyOnceWith('ahead', paceToneVolume)
  })
})
