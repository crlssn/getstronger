// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useOverflowEdges } from './useOverflowEdges'

/** jsdom lays nothing out, so the test plays the part of a scroll box. */
const measure = (element: HTMLElement, { scrollWidth = 0, clientWidth = 0, scrollLeft = 0 }) => {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth })
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  })
}

const Probe = ({ box }: { box: Parameters<typeof measure>[1] }) => {
  const ref = useRef<HTMLDivElement>(null)
  const edges = useOverflowEdges(ref)

  return (
    <div
      ref={(node) => {
        if (node) measure(node, box)
        ref.current = node
      }}
      data-testid="scroller"
    >
      {`${edges.start ? 'start' : ''} ${edges.end ? 'end' : ''}`.trim() || 'none'}
    </div>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useOverflowEdges', () => {
  test('reports neither edge when everything fits', () => {
    render(<Probe box={{ scrollWidth: 300, clientWidth: 300 }} />)

    expect(screen.getByTestId('scroller')).toHaveTextContent('none')
  })

  test('reports the far edge when there is more to the right', () => {
    render(<Probe box={{ scrollWidth: 600, clientWidth: 300 }} />)

    expect(screen.getByTestId('scroller')).toHaveTextContent('end')
  })

  test('reports both edges from the middle of the scroll', () => {
    render(<Probe box={{ scrollWidth: 600, clientWidth: 300, scrollLeft: 150 }} />)

    expect(screen.getByTestId('scroller')).toHaveTextContent('start end')
  })

  test('reports only the near edge once scrolled to the end', () => {
    render(<Probe box={{ scrollWidth: 600, clientWidth: 300, scrollLeft: 300 }} />)

    expect(screen.getByTestId('scroller')).toHaveTextContent('start')
  })

  // Sub-pixel layout leaves a fraction of a pixel over on boxes that do fit.
  test('ignores a sub-pixel overhang', () => {
    render(<Probe box={{ scrollWidth: 300.4, clientWidth: 300 }} />)

    expect(screen.getByTestId('scroller')).toHaveTextContent('none')
  })

  test('re-reads the box when it is scrolled', () => {
    render(<Probe box={{ scrollWidth: 600, clientWidth: 300 }} />)
    const scroller = screen.getByTestId('scroller')
    expect(scroller).toHaveTextContent('end')

    act(() => {
      scroller.scrollLeft = 300
      scroller.dispatchEvent(new Event('scroll'))
    })

    expect(scroller).toHaveTextContent('start')
  })
})
