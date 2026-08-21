import { describe, expect, test } from 'vitest'

import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import {
  convertDistance,
  distanceInKilometers,
  distanceUnitLabel,
  normalizeDistanceUnit,
} from '@/utils/distanceUnits'

describe('distance units', () => {
  test('defaults unspecified values to kilometers', () => {
    expect(normalizeDistanceUnit()).toBe(DistanceUnit.KILOMETERS)
    expect(normalizeDistanceUnit(DistanceUnit.UNSPECIFIED)).toBe(DistanceUnit.KILOMETERS)
    expect(distanceUnitLabel()).toBe('km')
  })

  test('converts between kilometers and miles at set precision', () => {
    expect(convertDistance(10, DistanceUnit.MILES, DistanceUnit.KILOMETERS)).toBe(16.09)
    expect(convertDistance(16.09, DistanceUnit.KILOMETERS, DistanceUnit.MILES)).toBe(10)
    expect(distanceInKilometers(10, DistanceUnit.MILES)).toBe(16.09)
    expect(distanceUnitLabel(DistanceUnit.MILES)).toBe('mi')
  })
})
