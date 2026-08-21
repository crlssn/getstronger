// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest'

import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from './preferences'

const store = () => usePreferencesStore.getState()

describe('usePreferencesStore', () => {
  beforeEach(() => {
    localStorage.clear()
    usePreferencesStore.setState({
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,
    })
  })

  test('defaults to metric', () => {
    expect(store().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(store().distanceUnit).toBe(DistanceUnit.KILOMETERS)
  })

  test('stores the imperial units', () => {
    store().setWeightUnit(WeightUnit.POUNDS)
    store().setDistanceUnit(DistanceUnit.MILES)

    expect(store().weightUnit).toBe(WeightUnit.POUNDS)
    expect(store().distanceUnit).toBe(DistanceUnit.MILES)
  })

  // getCurrentUser can return an unset unit, which must not leave the cache
  // holding UNSPECIFIED and rendering a blank suffix.
  test('normalises an unset unit back to metric', () => {
    store().setWeightUnit(WeightUnit.POUNDS)
    store().setDistanceUnit(DistanceUnit.MILES)

    store().setWeightUnit(undefined)
    store().setDistanceUnit(undefined)

    expect(store().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(store().distanceUnit).toBe(DistanceUnit.KILOMETERS)
  })

  test('resets both units', () => {
    store().setWeightUnit(WeightUnit.POUNDS)
    store().setDistanceUnit(DistanceUnit.MILES)

    store().reset()

    expect(store().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(store().distanceUnit).toBe(DistanceUnit.KILOMETERS)
  })

  test('persists the choice so an offline device keeps it', () => {
    store().setWeightUnit(WeightUnit.POUNDS)

    expect(JSON.parse(localStorage.getItem('preferences') ?? '{}')).toMatchObject({
      state: { weightUnit: WeightUnit.POUNDS },
    })
  })
})
