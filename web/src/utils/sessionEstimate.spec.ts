import { describe, expect, test } from 'vitest'

import { estimatedSessionMinutes } from './sessionEstimate'

describe('estimatedSessionMinutes', () => {
  test('counts eight minutes an exercise', () => {
    expect(estimatedSessionMinutes(9)).toBe(72)
  })

  // A one-exercise session still means changing, warming up and getting there.
  test('never estimates a session at under half an hour', () => {
    expect(estimatedSessionMinutes(1)).toBe(30)
    expect(estimatedSessionMinutes(0)).toBe(30)
  })
})
