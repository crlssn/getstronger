import { WeightUnit } from '@/proto/api/v1/shared_pb'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { normalizeWeightUnit } from '@/utils/weightUnits'

// Cached locally so the UI has an immediate value while `getCurrentUser`
// resolves, and so a device keeps working with the last-known preference
// when offline. The server's `User.weightUnit` remains the source of truth:
// every successful `getCurrentUser` call overwrites this cache.
export const usePreferencesStore = defineStore(
  'preferences',
  () => {
    const weightUnit = ref<WeightUnit>(WeightUnit.KILOGRAMS)

    const setWeightUnit = (unit?: WeightUnit) => {
      weightUnit.value = normalizeWeightUnit(unit)
    }

    const reset = () => {
      weightUnit.value = WeightUnit.KILOGRAMS
    }

    return {
      weightUnit,
      setWeightUnit,
      reset,
    }
  },
  {
    persist: true,
  },
)
