import { describe, expect, test } from 'vitest'

import { appendPage } from './appendPage'

const entry = (id: string) => ({ id })

describe('appendPage', () => {
  test('adds a page to the end of the list', () => {
    expect(appendPage([entry('a')], [entry('b'), entry('c')])).toEqual([
      entry('a'),
      entry('b'),
      entry('c'),
    ])
  })

  // The same page arriving twice is what a re-run effect or a scroll sentinel
  // firing again produces, and appending it blindly lists every row twice.
  test('skips what the list already holds', () => {
    expect(appendPage([entry('a'), entry('b')], [entry('b'), entry('c')])).toEqual([
      entry('a'),
      entry('b'),
      entry('c'),
    ])
  })

  test('hands back the same list when the page adds nothing', () => {
    const current = [entry('a')]

    expect(appendPage(current, [entry('a')])).toBe(current)
    expect(appendPage(current, [])).toBe(current)
  })

  test('starts a list from its first page', () => {
    expect(appendPage([], [entry('a')])).toEqual([entry('a')])
  })
})
