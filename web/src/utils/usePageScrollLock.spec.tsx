// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { usePageScrollLock } from './usePageScrollLock'

const scrolledTo = (offset: number) =>
  Object.defineProperty(window, 'scrollY', { configurable: true, value: offset })

const withScrollbar = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1040 })
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1040 - width,
  })
}

beforeEach(() => {
  scrolledTo(0)
  // jsdom has no layout, so scrollTo only logs that it is not implemented.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  document.body.removeAttribute('style')
  Reflect.deleteProperty(window, 'scrollY')
  Reflect.deleteProperty(window, 'innerWidth')
  Reflect.deleteProperty(document.documentElement, 'clientWidth')
  vi.restoreAllMocks()
})

describe('usePageScrollLock', () => {
  test('holds the page at the offset the reader left it on', () => {
    scrolledTo(900)

    renderHook(() => usePageScrollLock())

    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-900px')
    expect(document.body.style.width).toBe('100%')
  })

  test('puts the reader back where they were', () => {
    scrolledTo(900)

    renderHook(() => usePageScrollLock()).unmount()

    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 900)
  })

  test('asks for no scroll when the page never left the top', () => {
    renderHook(() => usePageScrollLock()).unmount()

    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  // A confirm opens over a picker, and the page thaws with the last of them:
  // the second lock reads a document already frozen at zero, so releasing on
  // its own would scroll the reader to the top.
  test('stays locked until the last lock goes', () => {
    scrolledTo(400)
    const outer = renderHook(() => usePageScrollLock())
    scrolledTo(0)
    const inner = renderHook(() => usePageScrollLock())

    inner.unmount()
    expect(document.body.style.top).toBe('-400px')

    outer.unmount()
    expect(document.body.style.position).toBe('')
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 400)
  })

  // Taking the body out of flow takes the scrollbar with it, and the page
  // behind the sheet slides sideways by its width as it opens.
  test('holds the width the scrollbar was taking, and gives it back', () => {
    withScrollbar(15)

    const { unmount } = renderHook(() => usePageScrollLock())
    expect(document.body.style.paddingRight).toBe('15px')

    unmount()
    expect(document.body.style.paddingRight).toBe('')
  })

  test('borrows nothing where the scrollbar takes no room', () => {
    withScrollbar(0)

    renderHook(() => usePageScrollLock())

    expect(document.body.style.paddingRight).toBe('')
  })
})
