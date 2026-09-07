// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest'

import { nextVolume, speechVolume, useAnnouncementsStore } from './announcements'

describe('useAnnouncementsStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAnnouncementsStore.setState({ volume: 'full' })
  })

  // Loud unless the athlete says otherwise: a guided session that says nothing
  // is a countdown nobody is watching.
  test('speaks at full volume until it is turned down', () => {
    expect(useAnnouncementsStore.getState().volume).toBe('full')
  })

  test('cycles full, low, off and back', () => {
    expect(nextVolume('full')).toBe('low')
    expect(nextVolume('low')).toBe('off')
    expect(nextVolume('off')).toBe('full')
  })

  // What the synthesiser is handed. Off is zero rather than a flag so a plugin
  // has one number to apply, and silence is the one value it must not speak at.
  test('carries each level to the synthesiser as a fraction', () => {
    expect(speechVolume('full')).toBe(1)
    expect(speechVolume('low')).toBe(0.4)
    expect(speechVolume('off')).toBe(0)
  })

  test('keeps the choice on the device', () => {
    useAnnouncementsStore.getState().setVolume('off')

    expect(JSON.parse(window.localStorage.getItem('announcements') ?? '{}')).toMatchObject({
      state: { volume: 'off' },
    })
  })
})
