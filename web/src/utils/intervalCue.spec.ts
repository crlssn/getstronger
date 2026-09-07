import { describe, expect, test } from 'vitest'

import { cuesInterval, defaultCueLead, normalizeCueLead } from './intervalCue'

describe('normalizeCueLead', () => {
  test.each([0, 5, 10, 15, 20])('keeps %i, which the picker offers', (seconds) => {
    expect(normalizeCueLead(seconds)).toBe(seconds)
  })

  // A device that stored something else — an older build, a hand-edited
  // store — falls back rather than cueing at a lead nobody chose.
  test.each([undefined, -5, 7, 3600, Number.NaN])('falls back to the default for %s', (seconds) => {
    expect(normalizeCueLead(seconds)).toBe(defaultCueLead)
  })
})

describe('cuesInterval', () => {
  test('warns an interval that is at least twice the lead', () => {
    expect(cuesInterval(20, 10)).toBe(true)
    expect(cuesInterval(60, 10)).toBe(true)
  })

  // Any earlier and the cue is a second instruction rather than a warning.
  test('leaves a shorter interval to run out unannounced', () => {
    expect(cuesInterval(19, 10)).toBe(false)
    expect(cuesInterval(5, 10)).toBe(false)
  })

  test('says nothing at all when the lead is off', () => {
    expect(cuesInterval(600, 0)).toBe(false)
  })

  // The one open interval of a session with no set length never ends on its
  // own, so there is no boundary to warn about.
  test('says nothing for an open interval', () => {
    expect(cuesInterval(undefined, 10)).toBe(false)
  })
})
