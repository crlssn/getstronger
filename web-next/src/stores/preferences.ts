import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { normalizeWeightUnit } from '@/utils/weightUnits'

interface PreferencesState {
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  autofillSets: boolean
  setWeightUnit: (unit?: WeightUnit) => void
  setDistanceUnit: (unit?: DistanceUnit) => void
  setAutofillSets: (enabled?: boolean) => void
  reset: () => void
}

const defaults = {
  weightUnit: WeightUnit.KILOGRAMS,
  distanceUnit: DistanceUnit.KILOMETERS,
  // Off unless the account asked for it: a value nobody typed is a surprise,
  // so the workout screen only prefills when this is true.
  autofillSets: false,
}

// Cached locally so the UI has an immediate value while `getCurrentUser`
// resolves, and so a device keeps working with the last-known preference
// when offline. The server's `User.weightUnit`/`User.distanceUnit` remain the
// source of truth: every successful `getCurrentUser` call overwrites this
// cache.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,

      setWeightUnit: (unit) => set({ weightUnit: normalizeWeightUnit(unit) }),
      setDistanceUnit: (unit) => set({ distanceUnit: normalizeDistanceUnit(unit) }),
      setAutofillSets: (enabled) => set({ autofillSets: enabled ?? false }),

      reset: () => set(defaults),
    }),
    {
      name: 'preferences',
      storage: migratedStorage(),
      partialize: ({ weightUnit, distanceUnit, autofillSets }) => ({
        weightUnit,
        distanceUnit,
        autofillSets,
      }),
    },
  ),
)
