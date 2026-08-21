import { DistanceUnit } from '@/proto/api/v1/shared_pb'

const kilometersPerMile = 1.609344

export const normalizeDistanceUnit = (unit?: DistanceUnit) =>
  unit === DistanceUnit.MILES ? DistanceUnit.MILES : DistanceUnit.KILOMETERS

export const distanceUnitLabel = (unit?: DistanceUnit) =>
  normalizeDistanceUnit(unit) === DistanceUnit.MILES ? 'mi' : 'km'

export const convertDistance = (distance: number, from?: DistanceUnit, to?: DistanceUnit) => {
  const source = normalizeDistanceUnit(from)
  const target = normalizeDistanceUnit(to)
  if (source === target) return distance

  const converted =
    source === DistanceUnit.MILES ? distance * kilometersPerMile : distance / kilometersPerMile
  return Math.round(converted * 100) / 100
}

export const distanceInKilometers = (distance: number, unit?: DistanceUnit) =>
  convertDistance(distance, unit, DistanceUnit.KILOMETERS)
