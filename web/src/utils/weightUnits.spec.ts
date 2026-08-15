import { describe, expect, test } from 'vitest'

import { WeightUnit } from '@/proto/api/v1/shared_pb'
import {
  convertWeight,
  normalizeWeightUnit,
  weightInKilograms,
  weightUnitLabel,
} from '@/utils/weightUnits'

describe('weight units', () => {
  test('defaults unspecified values to kilograms', () => {
    expect(normalizeWeightUnit()).toBe(WeightUnit.KILOGRAMS)
    expect(normalizeWeightUnit(WeightUnit.UNSPECIFIED)).toBe(WeightUnit.KILOGRAMS)
    expect(weightUnitLabel()).toBe('kg')
  })

  test('converts between kilograms and pounds at set precision', () => {
    expect(convertWeight(100, WeightUnit.POUNDS, WeightUnit.KILOGRAMS)).toBe(45.36)
    expect(convertWeight(45.36, WeightUnit.KILOGRAMS, WeightUnit.POUNDS)).toBe(100)
    expect(weightInKilograms(100, WeightUnit.POUNDS)).toBe(45.36)
    expect(weightUnitLabel(WeightUnit.POUNDS)).toBe('lbs')
  })
})
