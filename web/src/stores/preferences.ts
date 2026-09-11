import type { PaceReferenceChoice } from '@/utils/pacing'

import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { defaultCueLead, normalizeCueLead } from '@/utils/intervalCue'
import { normalizeWeightUnit } from '@/utils/weightUnits'

interface PreferencesState {
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  autofillSets: boolean
  autoPause: boolean
  /** Seconds of warning before an interval ends; 0 sounds nothing. */
  intervalCueLeadSeconds: number
  /** Whether an interval is called at its midpoint, with the pace held so far. */
  halfwayCue: boolean
  paceReference: PaceReferenceChoice
  setWeightUnit: (unit?: WeightUnit) => void
  setDistanceUnit: (unit?: DistanceUnit) => void
  setAutofillSets: (enabled?: boolean) => void
  setAutoPause: (enabled?: boolean) => void
  setIntervalCueLeadSeconds: (seconds?: number) => void
  setHalfwayCue: (enabled?: boolean) => void
  setPaceReference: (reference: PaceReferenceChoice) => void
  reset: () => void
}

const defaults = {
  weightUnit: WeightUnit.KILOGRAMS,
  distanceUnit: DistanceUnit.KILOMETERS,
  // Off unless the account asked for it: a value nobody typed is a surprise,
  // so the workout screen only prefills when this is true.
  autofillSets: false,
  // Off unless the account asked for it too: a clock that stops on its own is
  // a surprise to anyone who did not ask a recording to hold itself.
  autoPause: false,
  intervalCueLeadSeconds: defaultCueLead,
  // Off unless the account asked for it: a voice halfway through an interval
  // nobody asked to have halved is a surprise mid-run.
  halfwayCue: false,
  // Which session a recording is paced against. Off unless the account asked
  // for it: a note in the ear nobody asked for is a surprise mid-run.
  paceReference: 'off' as PaceReferenceChoice,
}

// Cached locally so the UI has an immediate value while `getCurrentUser`
// resolves, and so a device keeps working with the last-known preference
// when offline. The server's `User.weightUnit`/`User.distanceUnit` remain the
// source of truth: every successful `getCurrentUser` call overwrites this
// cache. The interval cue has no field on the server and is only ever this
// device's, which is why nothing refreshes it.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,

      setWeightUnit: (unit) => set({ weightUnit: normalizeWeightUnit(unit) }),
      setDistanceUnit: (unit) => set({ distanceUnit: normalizeDistanceUnit(unit) }),
      setAutofillSets: (enabled) => set({ autofillSets: enabled ?? false }),
      setAutoPause: (enabled) => set({ autoPause: enabled ?? false }),
      setIntervalCueLeadSeconds: (seconds) =>
        set({ intervalCueLeadSeconds: normalizeCueLead(seconds) }),
      setHalfwayCue: (enabled) => set({ halfwayCue: enabled ?? false }),
      setPaceReference: (reference) => set({ paceReference: reference }),

      reset: () => set(defaults),
    }),
    {
      name: 'preferences',
      storage: migratedStorage(),
      partialize: ({
        weightUnit,
        distanceUnit,
        autofillSets,
        autoPause,
        intervalCueLeadSeconds,
        halfwayCue,
        paceReference,
      }) => ({
        weightUnit,
        distanceUnit,
        autofillSets,
        autoPause,
        intervalCueLeadSeconds,
        halfwayCue,
        paceReference,
      }),
    },
  ),
)
