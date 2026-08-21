// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useInfiniteScroll } from './useInfiniteScroll'

// jsdom has no IntersectionObserver. This fake captures the callback so a
// test can trigger it directly, and records every element observed.
let intersect: (target: Element) => void = () => {}
const observedTargets: Element[] = []
const disconnectSpy = vi.fn()

class FakeIntersectionObserver {
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    intersect = (target) =>
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
  }

  observe(target: Element) {
    observedTargets.push(target)
  }

  disconnect() {
    disconnectSpy()
  }

  unobserve() {}
}

beforeEach(() => {
  observedTargets.length = 0
  disconnectSpy.mockClear()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// A real element attached through the returned ref, set during the render
// callback itself — mirroring how React commits a JSX `ref` prop before its
// effects run, ahead of this hook's own effect.
const renderAttached = (
  onIntersect: () => void,
  enabled: boolean,
  node = document.createElement('li'),
) => {
  const view = renderHook(() => {
    const ref = useInfiniteScroll<HTMLLIElement>(onIntersect, enabled)
    ref.current = node
    return ref
  })
  return { node, ...view }
}

describe('useInfiniteScroll', () => {
  test('does not observe anything until the ref is attached', () => {
    renderHook(() => useInfiniteScroll(vi.fn(), true))

    expect(observedTargets).toHaveLength(0)
  })

  test('observes the sentinel and calls the callback when it intersects', () => {
    const onIntersect = vi.fn()
    const { node } = renderAttached(onIntersect, true)

    expect(observedTargets).toContain(node)
    act(() => intersect(node))
    expect(onIntersect).toHaveBeenCalledOnce()
  })

  test('does not observe when disabled', () => {
    renderAttached(vi.fn(), false)

    expect(observedTargets).toHaveLength(0)
  })

  test('disconnects the observer on unmount', () => {
    const { unmount } = renderAttached(vi.fn(), true)

    unmount()
    expect(disconnectSpy).toHaveBeenCalledOnce()
  })

  test('always calls the latest callback, even without re-observing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const node = document.createElement('li')
    const { rerender } = renderHook(
      ({ onIntersect }: { onIntersect: () => void }) => {
        const ref = useInfiniteScroll<HTMLLIElement>(onIntersect, true)
        ref.current = node
        return ref
      },
      { initialProps: { onIntersect: first } },
    )

    rerender({ onIntersect: second })
    act(() => intersect(node))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
