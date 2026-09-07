import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'

/** How loudly a guided session speaks: as recorded, quietly, or not at all. */
export type AnnouncementVolume = 'full' | 'low' | 'off'

const order: readonly AnnouncementVolume[] = ['full', 'low', 'off']

/** The one word each level goes by, wherever it is shown. */
export const volumeLabelKey: Record<AnnouncementVolume, string> = {
  full: 'timedCircuit.volumeFull',
  low: 'timedCircuit.volumeLow',
  off: 'timedCircuit.volumeOff',
}

/** The levels in the order the recording screen's pill cycles them. */
export const announcementVolumes = order

const fractions: Record<AnnouncementVolume, number> = {
  full: 1,
  low: 0.4,
  off: 0,
}

/** The level after this one, wrapping — the control is one tap, not a slider. */
export const nextVolume = (volume: AnnouncementVolume): AnnouncementVolume =>
  order[(order.indexOf(volume) + 1) % order.length]

/**
 * The level as the fraction a synthesiser takes.
 *
 * Off is zero rather than a separate flag so each plugin applies one number,
 * and zero is the value it must not speak at all at: an utterance at no volume
 * still activates the audio session and ducks whatever the athlete is playing.
 */
export const speechVolume = (volume: AnnouncementVolume): number => fractions[volume]

interface AnnouncementsState {
  volume: AnnouncementVolume
  setVolume: (volume: AnnouncementVolume) => void
}

/**
 * How loud the interval announcements are, kept on the device.
 *
 * There is no field for it on the account, and it answers a question about
 * where the athlete is rather than who they are — running with someone else,
 * or with music on. Full until it is turned down, and turned down it stays
 * that way for the sessions after this one.
 */
export const useAnnouncementsStore = create<AnnouncementsState>()(
  persist(
    (set) => ({
      volume: 'full',

      setVolume: (volume) => set({ volume }),
    }),
    {
      name: 'announcements',
      storage: migratedStorage(),
      partialize: ({ volume }) => ({ volume }),
    },
  ),
)
