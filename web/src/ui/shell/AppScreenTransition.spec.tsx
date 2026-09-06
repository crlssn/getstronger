// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const router = vi.hoisted(() => ({ navigationType: 'PUSH' }))

vi.mock('react-router-dom', () => ({
  NavigationType: { Pop: 'POP', Push: 'PUSH', Replace: 'REPLACE' },
  useNavigationType: () => router.navigationType,
}))

import { AppScreenTransition } from './AppScreenTransition'

describe('AppScreenTransition', () => {
  beforeEach(() => {
    router.navigationType = 'PUSH'
  })

  test('renders the screen it wraps', () => {
    render(
      <AppScreenTransition transitionKey="/home">
        <p>The screen</p>
      </AppScreenTransition>,
    )

    expect(screen.getByText('The screen')).toBeInTheDocument()
  })

  // The entrance animation replays by remounting: a new key is a new element,
  // so landing on another path starts the fade from its first frame.
  test('remounts the screen when the key changes', () => {
    const { rerender } = render(
      <AppScreenTransition transitionKey="/home">
        <p>The screen</p>
      </AppScreenTransition>,
    )
    const before = screen.getByText('The screen')

    rerender(
      <AppScreenTransition transitionKey="/exercises">
        <p>The screen</p>
      </AppScreenTransition>,
    )

    expect(screen.getByText('The screen')).not.toBe(before)
  })

  // A re-render on the same path — data arriving, a skeleton resolving — must
  // not flash the settled screen through the fade again.
  test('keeps the settled screen while the key holds', () => {
    const { rerender } = render(
      <AppScreenTransition transitionKey="/home">
        <p>The screen</p>
      </AppScreenTransition>,
    )
    const before = screen.getByText('The screen')

    rerender(
      <AppScreenTransition transitionKey="/home">
        <p>The screen</p>
      </AppScreenTransition>,
    )

    expect(screen.getByText('The screen')).toBe(before)
  })

  // Arriving somewhere new is the only arrival worth animating.
  test('fades a screen in on the way forward', () => {
    render(
      <AppScreenTransition transitionKey="/home">
        <p>The screen</p>
      </AppScreenTransition>,
    )

    expect(screen.getByText('The screen').parentElement?.className).not.toBe('')
  })

  // Going back returns to a screen already seen, and on iOS the swipe has just
  // dragged it into view — fading it in would flash it as the peel lands.
  test('leaves a screen alone on the way back', () => {
    router.navigationType = 'POP'

    render(
      <AppScreenTransition transitionKey="/home">
        <p>The screen</p>
      </AppScreenTransition>,
    )

    expect(screen.getByText('The screen').parentElement?.className).toBe('')
  })
})
