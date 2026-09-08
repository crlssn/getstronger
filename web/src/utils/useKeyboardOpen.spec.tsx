// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  native: false,
  addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { addListener: bridge.addListener },
}))

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

/** The plugin's events, delivered the way a phone would: a listener each. */
const fakePlugin = () => {
  const listeners: Record<string, (() => void) | undefined> = {}
  const removed: string[] = []

  bridge.addListener.mockImplementation((event: string, listener: () => void) => {
    listeners[event] = listener
    return Promise.resolve({ remove: () => Promise.resolve(void removed.push(event)) })
  })

  return {
    fire: (event: string) => act(() => listeners[event]?.()),
    listened: () => Object.keys(listeners),
    removed,
  }
}

const Probe = () => <span>{useKeyboardOpen() ? 'open' : 'closed'}</span>

beforeEach(() => {
  bridge.native = false
  bridge.addListener.mockReset()
})

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

  test('never asks the plugin in a browser', () => {
    render(<Probe />)

    expect(bridge.addListener).not.toHaveBeenCalled()
  })

  // The native WebView shrinks with the keyboard, so the layout viewport
  // loses the same height as the visual one and the inference above goes
  // blind. The plugin says so outright.
  describe('in the native app', () => {
    beforeEach(() => {
      bridge.native = true
    })

    test('follows the plugin rather than the viewport', async () => {
      const plugin = fakePlugin()
      render(<Probe />)

      await vi.waitFor(() =>
        expect(plugin.listened()).toEqual(['keyboardWillShow', 'keyboardWillHide']),
      )
      expect(screen.getByText('closed')).toBeInTheDocument()

      plugin.fire('keyboardWillShow')
      expect(screen.getByText('open')).toBeInTheDocument()

      plugin.fire('keyboardWillHide')
      expect(screen.getByText('closed')).toBeInTheDocument()
    })

    test('ignores the viewport, which shrinks with the keyboard there', async () => {
      const plugin = fakePlugin()
      const viewport = fakeViewport(window.innerHeight)
      render(<Probe />)
      await vi.waitFor(() => expect(plugin.listened()).toHaveLength(2))

      viewport.resize(window.innerHeight - 300)

      expect(screen.getByText('closed')).toBeInTheDocument()
    })

    test('stops listening when it unmounts', async () => {
      const plugin = fakePlugin()
      const { unmount } = render(<Probe />)
      await vi.waitFor(() => expect(plugin.listened()).toHaveLength(2))

      unmount()

      await vi.waitFor(() =>
        expect(plugin.removed).toEqual(['keyboardWillShow', 'keyboardWillHide']),
      )
    })

    // A mount that is gone before the plugin loaded still leaves no listener
    // behind, since `<StrictMode>` mounts and unmounts every effect once.
    test('stops listening when it unmounts before the plugin answered', async () => {
      const plugin = fakePlugin()
      const { unmount } = render(<Probe />)

      unmount()

      await vi.waitFor(() =>
        expect(plugin.removed).toEqual(['keyboardWillShow', 'keyboardWillHide']),
      )
    })

    test('reports it closed and carries on when the plugin refuses', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      bridge.addListener.mockRejectedValue(new Error('no keyboard'))
      render(<Probe />)

      await vi.waitFor(() => expect(warn).toHaveBeenCalled())

      expect(screen.getByText('closed')).toBeInTheDocument()
      warn.mockRestore()
    })
  })
})
