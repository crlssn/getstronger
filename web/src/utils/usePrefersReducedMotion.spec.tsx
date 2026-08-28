// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const matchMedia = (matches: boolean) =>
  vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('usePrefersReducedMotion', () => {
  test('reports the preference when it is set', () => {
    vi.stubGlobal('matchMedia', matchMedia(true))

    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true)
  })

  test('reports no preference by default', () => {
    vi.stubGlobal('matchMedia', matchMedia(false))

    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false)
  })

  // jsdom has no matchMedia, and neither do some embedded webviews.
  test('assumes motion is fine where the question cannot be asked', () => {
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false)
  })
})
