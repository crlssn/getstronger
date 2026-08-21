import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import AppList from './AppList'
import AppListItem from './AppListItem'

// jsdom has no IntersectionObserver. This fake captures the callback so a
// test can trigger it directly, and records every element observed so a test
// can assert whether the sentinel was watched at all.
let observed: Element[] = []
let intersect: (target: Element) => void = () => {}

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
    observed.push(target)
  }

  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  observed = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppList', () => {
  test('renders its children as a list', () => {
    render(
      <AppList>
        <AppListItem>Bench press</AppListItem>
        <AppListItem>Squat</AppListItem>
      </AppList>,
    )

    expect(screen.getByRole('list').children).toHaveLength(2)
  })

  test('omits the fetching sentinel when canFetch is not set', () => {
    render(
      <AppList>
        <AppListItem>Bench press</AppListItem>
      </AppList>,
    )

    expect(observed).toHaveLength(0)
  })

  test('watches the sentinel and calls onFetch when it scrolls into view', () => {
    const onFetch = vi.fn()
    render(
      <AppList canFetch onFetch={onFetch}>
        <AppListItem>Bench press</AppListItem>
      </AppList>,
    )

    expect(observed).toHaveLength(1)
    act(() => intersect(observed[0]))
    expect(onFetch).toHaveBeenCalledOnce()
  })
})
