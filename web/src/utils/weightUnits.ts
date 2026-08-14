import { WeightUnit } from '@/proto/api/v1/shared_pb'

const kilogramsPerPound = 0.45359237

export const normalizeWeightUnit = (unit?: WeightUnit) =>
  unit === WeightUnit.POUNDS ? WeightUnit.POUNDS : WeightUnit.KILOGRAMS

export const weightUnitLabel = (unit?: WeightUnit) =>
  normalizeWeightUnit(unit) === WeightUnit.POUNDS ? 'lbs' : 'kg'

export const convertWeight = (weight: number, from?: WeightUnit, to?: WeightUnit) => {
  const source = normalizeWeightUnit(from)
  const target = normalizeWeightUnit(to)
  if (source === target) return weight

  const converted =
    source === WeightUnit.POUNDS ? weight * kilogramsPerPound : weight / kilogramsPerPound
  return Math.round(converted * 100) / 100
}

export const weightInKilograms = (weight: number, unit?: WeightUnit) =>
  convertWeight(weight, unit, WeightUnit.KILOGRAMS)
