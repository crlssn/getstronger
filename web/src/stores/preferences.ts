import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { normalizeWeightUnit } from '@/utils/weightUnits'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'

// Cached locally so the UI has an immediate value while `getCurrentUser`
// resolves, and so a device keeps working with the last-known preference
// when offline. The server's `User.weightUnit`/`User.distanceUnit` remain the
// source of truth: every successful `getCurrentUser` call overwrites this
// cache.
export const usePreferencesStore = defineStore(
  'preferences',
  () => {
    const weightUnit = ref<WeightUnit>(WeightUnit.KILOGRAMS)
    const distanceUnit = ref<DistanceUnit>(DistanceUnit.KILOMETERS)
    // Off unless the account asked for it: a value nobody typed is a
    // surprise, so the workout screen only prefills when this is true.
    const autofillSets = ref(false)

    const setWeightUnit = (unit?: WeightUnit) => {
      weightUnit.value = normalizeWeightUnit(unit)
    }

    const setDistanceUnit = (unit?: DistanceUnit) => {
      distanceUnit.value = normalizeDistanceUnit(unit)
    }

    const setAutofillSets = (enabled?: boolean) => {
      autofillSets.value = enabled ?? false
    }

    const reset = () => {
      weightUnit.value = WeightUnit.KILOGRAMS
      distanceUnit.value = DistanceUnit.KILOMETERS
      autofillSets.value = false
    }

    return {
      weightUnit,
      distanceUnit,
      autofillSets,
      setWeightUnit,
      setDistanceUnit,
      setAutofillSets,
      reset,
    }
  },
  {
    persist: true,
  },
)
