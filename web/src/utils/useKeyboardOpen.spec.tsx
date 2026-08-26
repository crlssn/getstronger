// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { useKeyboardOpen } from './useKeyboardOpen'

/** jsdom has no visual viewport, so the test plays the part of one. */
const fakeViewport = (height: number) => {
  const target = new EventTarget()
  const viewport = {
    height,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    resize: (to: number) => {
      viewport.height = to
      act(() => void target.dispatchEvent(new Event('resize')))
    },
  }

  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  return viewport
}

const Probe = () => <span>{useKeyboardOpen() ? 'open' : 'closed'}</span>

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
})

describe('useKeyboardOpen', () => {
  test('reports the keyboard open once the viewport loses room to it', () => {
    const viewport = fakeViewport(window.innerHeight)
    render(<Probe />)

    expect(screen.getByText('closed')).toBeInTheDocument()

    viewport.resize(window.innerHeight - 300)
    expect(screen.getByText('open')).toBeInTheDocument()

    viewport.resize(window.innerHeight)
    expect(screen.getByText('closed')).toBeInTheDocument()
  })

  // A pull-to-refresh nudge or a URL bar sliding away is not a keyboard.
  test('ignores a viewport that only loses a sliver', () => {
    const viewport = fakeViewport(window.innerHeight)
    render(<Probe />)

    viewport.resize(window.innerHeight - 60)

    expect(screen.getByText('closed')).toBeInTheDocument()
  })

  test('reports it closed where there is no visual viewport to read', () => {
    render(<Probe />)

    expect(screen.getByText('closed')).toBeInTheDocument()
  })
})
