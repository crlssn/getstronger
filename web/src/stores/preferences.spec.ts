// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest'

import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import { defaultCueLead } from '@/utils/intervalCue'
import { usePreferencesStore } from './preferences'

const store = () => usePreferencesStore.getState()

describe('usePreferencesStore', () => {
  beforeEach(() => {
    localStorage.clear()
    usePreferencesStore.setState({
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,
      autofillSets: false,
      intervalCueLeadSeconds: defaultCueLead,
    })
  })

  test('defaults to metric', () => {
    expect(store().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(store().distanceUnit).toBe(DistanceUnit.KILOMETERS)
  })

  // A value nobody typed is a surprise, so prefilling is opt-in.
  test('leaves set prefill off until the account asks for it', () => {
    expect(store().autofillSets).toBe(false)

    store().setAutofillSets(true)

    expect(store().autofillSets).toBe(true)
  })

  test.each([undefined, false])('treats %o as prefill off', (value) => {
    store().setAutofillSets(true)

    store().setAutofillSets(value)

    expect(store().autofillSets).toBe(false)
  })

  // The lead a runner gets before an interval ends, and the value the three
  // recorders are handed when a session starts.
  test('warns ten seconds before an interval ends until it is told otherwise', () => {
    expect(store().intervalCueLeadSeconds).toBe(10)

    store().setIntervalCueLeadSeconds(20)

    expect(store().intervalCueLeadSeconds).toBe(20)
  })

  test('turns the cue off at zero', () => {
    store().setIntervalCueLeadSeconds(0)

    expect(store().intervalCueLeadSeconds).toBe(0)
  })

  // A lead the picker never offered — an older build, a hand-edited store —
  // is not a lead to cue at.
  test('falls back to the default for a lead nobody could have chosen', () => {
    store().setIntervalCueLeadSeconds(0)

    store().setIntervalCueLeadSeconds(7)

    expect(store().intervalCueLeadSeconds).toBe(defaultCueLead)
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

  // The preferences belong to the account that just signed out, not to the
  // device, so every one of them goes back to its default.
  test('resets every preference', () => {
    store().setWeightUnit(WeightUnit.POUNDS)
    store().setDistanceUnit(DistanceUnit.MILES)
    store().setAutofillSets(true)
    store().setIntervalCueLeadSeconds(0)

    store().reset()

    expect(store().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(store().distanceUnit).toBe(DistanceUnit.KILOMETERS)
    expect(store().autofillSets).toBe(false)
    expect(store().intervalCueLeadSeconds).toBe(defaultCueLead)
  })

  test('persists the choice so an offline device keeps it', () => {
    store().setWeightUnit(WeightUnit.POUNDS)
    store().setIntervalCueLeadSeconds(15)

    expect(JSON.parse(localStorage.getItem('preferences') ?? '{}')).toMatchObject({
      state: { weightUnit: WeightUnit.POUNDS, intervalCueLeadSeconds: 15 },
    })
  })
})
