import { describe, expect, test } from 'vitest'

import {
  appendTags,
  matchingSuggestions,
  maxTagLength,
  maxTags,
  splitCandidates,
} from './exerciseTags'

describe('matchingSuggestions', () => {
  const suggestions = ['Chest', 'Upper chest', 'Chest press', 'Back']

  test('suggests nothing until something is typed', () => {
    expect(matchingSuggestions(suggestions, [], '  ')).toEqual([])
  })

  // The tag being typed is most likely the one that starts that way, so those
  // come first; alphabetical within each group.
  test('puts a leading match before a mere containment', () => {
    expect(matchingSuggestions(suggestions, [], 'chest')).toEqual([
      'Chest',
      'Chest press',
      'Upper chest',
    ])
  })

  test('leaves out what is already chosen', () => {
    expect(matchingSuggestions(suggestions, ['chest'], 'chest')).toEqual([
      'Chest press',
      'Upper chest',
    ])
  })

  test('caps the list at eight', () => {
    const many = Array.from({ length: 20 }, (_, index) => `Tag ${index}`)

    expect(matchingSuggestions(many, [], 'tag')).toHaveLength(8)
  })

  test('suggests nothing once the tag limit is reached', () => {
    const full = Array.from({ length: maxTags }, (_, index) => `Tag ${index}`)

    expect(matchingSuggestions(suggestions, full, 'chest')).toEqual([])
  })
})

describe('appendTags', () => {
  test('adds what it is given', () => {
    expect(appendTags(['Chest'], ['Push']).tags).toEqual(['Chest', 'Push'])
  })

  // Otherwise the same tag ends up spelled two ways across exercises.
  test('adopts an existing tag’s casing', () => {
    expect(appendTags([], ['CHEST'], ['Chest']).tags).toEqual(['Chest'])
  })

  test('refuses a duplicate, whatever its casing', () => {
    const result = appendTags(['Chest'], ['chest'])

    expect(result.tags).toEqual(['Chest'])
    expect(result.rejection).toEqual({ reason: 'duplicate', tag: 'chest' })
  })

  test('refuses a tag longer than the limit', () => {
    const result = appendTags([], ['x'.repeat(maxTagLength + 1)])

    expect(result.tags).toEqual([])
    expect(result.rejection).toEqual({ reason: 'tooLong' })
  })

  test('stops at the tag limit', () => {
    const full = Array.from({ length: maxTags }, (_, index) => `Tag ${index}`)
    const result = appendTags(full, ['One more'])

    expect(result.tags).toHaveLength(maxTags)
    expect(result.rejection).toEqual({ reason: 'tooMany' })
  })

  // One bad candidate in a pasted list must not lose the good ones.
  test('keeps the candidates it can take and reports the last it could not', () => {
    const result = appendTags(['Chest'], ['Push', 'chest', 'Pull'])

    expect(result.tags).toEqual(['Chest', 'Push', 'Pull'])
    expect(result.rejection).toEqual({ reason: 'duplicate', tag: 'chest' })
  })

  test('says nothing went wrong when nothing did', () => {
    expect(appendTags([], ['Push']).rejection).toBeUndefined()
  })

  test('ignores blank candidates', () => {
    expect(appendTags([], ['  ', 'Push']).tags).toEqual(['Push'])
  })
})

describe('splitCandidates', () => {
  test('splits a pasted list on commas', () => {
    expect(splitCandidates('Chest, Push , ,Upper')).toEqual(['Chest', 'Push', 'Upper'])
  })

  test('is empty for whitespace', () => {
    expect(splitCandidates('  ')).toEqual([])
  })
})
