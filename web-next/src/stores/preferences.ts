import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { normalizeWeightUnit } from '@/utils/weightUnits'

interface PreferencesState {
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  setWeightUnit: (unit?: WeightUnit) => void
  setDistanceUnit: (unit?: DistanceUnit) => void
  reset: () => void
}

// Cached locally so the UI has an immediate value while `getCurrentUser`
// resolves, and so a device keeps working with the last-known preference
// when offline. The server's `User.weightUnit`/`User.distanceUnit` remain the
// source of truth: every successful `getCurrentUser` call overwrites this
// cache.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,

      setWeightUnit: (unit) => set({ weightUnit: normalizeWeightUnit(unit) }),
      setDistanceUnit: (unit) => set({ distanceUnit: normalizeDistanceUnit(unit) }),

      reset: () => set({ weightUnit: WeightUnit.KILOGRAMS, distanceUnit: DistanceUnit.KILOMETERS }),
    }),
    {
      name: 'preferences',
      partialize: ({ weightUnit, distanceUnit }) => ({ weightUnit, distanceUnit }),
    },
  ),
)
