// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useInfiniteScroll } from './useInfiniteScroll'

/** Drives the observer by hand: jsdom has no layout, so nothing intersects. */
let observers: Array<{
  callback: IntersectionObserverCallback
  observed: Element[]
  disconnected: boolean
}>

const trigger = (index = 0) => {
  const observer = observers[index]
  observer?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as never)
}

const Sentinel = ({ onReach, enabled }: { onReach: () => void; enabled?: boolean }) => {
  const ref = useInfiniteScroll<HTMLDivElement>(onReach, enabled)
  return <div ref={ref} data-testid="sentinel" />
}

beforeEach(() => {
  observers = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, observed: [], disconnected: false })
      }
      observe(element: Element) {
        observers.at(-1)?.observed.push(element)
      }
      disconnect() {
        const observer = observers.find((entry) => !entry.disconnected)
        if (observer) observer.disconnected = true
      }
      unobserve() {}
      takeRecords() {
        return []
      }
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useInfiniteScroll', () => {
  test('calls back when the sentinel comes into view', () => {
    const onReach = vi.fn()
    render(<Sentinel onReach={onReach} />)

    trigger()

    expect(onReach).toHaveBeenCalledOnce()
  })

  test('watches the element the ref is attached to', () => {
    const { getByTestId } = render(<Sentinel onReach={vi.fn()} />)

    expect(observers[0]?.observed).toEqual([getByTestId('sentinel')])
  })

  test('does not observe while disabled', () => {
    render(<Sentinel onReach={vi.fn()} enabled={false} />)

    expect(observers).toHaveLength(0)
  })

  test('stops watching when unmounted', () => {
    const { unmount } = render(<Sentinel onReach={vi.fn()} />)

    unmount()

    expect(observers[0]?.disconnected).toBe(true)
  })

  // Callers pass an inline function, so a rebuild on every render would fire
  // the callback again immediately — a fetch loop.
  test('keeps one observer across re-renders', () => {
    const { rerender } = render(<Sentinel onReach={() => {}} />)

    rerender(<Sentinel onReach={() => {}} />)
    rerender(<Sentinel onReach={() => {}} />)

    expect(observers).toHaveLength(1)
  })

  test('calls the latest callback rather than the one it was built with', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Sentinel onReach={first} />)

    rerender(<Sentinel onReach={second} />)
    trigger()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  test('ignores an entry that is not intersecting', () => {
    const onReach = vi.fn()
    render(<Sentinel onReach={onReach} />)

    observers[0]?.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as never)

    expect(onReach).not.toHaveBeenCalled()
  })

  // A list that cannot page beats a crash.
  test('does nothing where IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined)

    expect(() => render(<Sentinel onReach={vi.fn()} />)).not.toThrow()
  })
})
