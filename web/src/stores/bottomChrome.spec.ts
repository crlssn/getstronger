import { beforeEach, describe, expect, test } from 'vitest'

import { selectBottomChrome, useBottomChrome } from './bottomChrome'

describe('useBottomChrome', () => {
  beforeEach(() => {
    useBottomChrome.setState({ pinned: {} })
  })

  test('is nothing to clear when nothing is pinned', () => {
    expect(selectBottomChrome(useBottomChrome.getState())).toBe(0)
  })

  // A create screen pins its form footer and no tab bar; every other screen
  // pins the tab bar. Taking the tallest covers a screen that somehow has both.
  test('clears the tallest thing pinned', () => {
    useBottomChrome.getState().pin('tab-bar', 72)
    useBottomChrome.getState().pin('form-footer', 76)

    expect(selectBottomChrome(useBottomChrome.getState())).toBe(76)
  })

  test('gives the room back when something unpins', () => {
    useBottomChrome.getState().pin('tab-bar', 72)
    useBottomChrome.getState().unpin('tab-bar')

    expect(selectBottomChrome(useBottomChrome.getState())).toBe(0)
  })
})
