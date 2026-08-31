// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppScreenTransition } from './AppScreenTransition'

describe('AppScreenTransition', () => {
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
})
