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
  /** Seconds of warning before an interval ends; 0 sounds nothing. */
  intervalCueLeadSeconds: number
  paceReference: PaceReferenceChoice
  setWeightUnit: (unit?: WeightUnit) => void
  setDistanceUnit: (unit?: DistanceUnit) => void
  setAutofillSets: (enabled?: boolean) => void
  setIntervalCueLeadSeconds: (seconds?: number) => void
  setPaceReference: (reference: PaceReferenceChoice) => void
  reset: () => void
}

const defaults = {
  weightUnit: WeightUnit.KILOGRAMS,
  distanceUnit: DistanceUnit.KILOMETERS,
  // Off unless the account asked for it: a value nobody typed is a surprise,
  // so the workout screen only prefills when this is true.
  autofillSets: false,
  intervalCueLeadSeconds: defaultCueLead,
  // Which session a recording is paced against. The last rather than the best,
  // because an athlete two weeks into a routine is chasing what they did on
  // Tuesday, not their record.
  paceReference: 'previous' as PaceReferenceChoice,
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
      setIntervalCueLeadSeconds: (seconds) =>
        set({ intervalCueLeadSeconds: normalizeCueLead(seconds) }),
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
        intervalCueLeadSeconds,
        paceReference,
      }) => ({
        weightUnit,
        distanceUnit,
        autofillSets,
        intervalCueLeadSeconds,
        paceReference,
      }),
    },
  ),
)
