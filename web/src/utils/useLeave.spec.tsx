// @vitest-environment jsdom

import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'

import { useLeave } from './useLeave'

/** Opens /routines/1/edit with the routine behind it, and hands back `leave`. */
const open = () => {
  let router!: ReturnType<typeof createMemoryRouter>
  const wrapper = ({ children }: { children: ReactNode }) => {
    router ??= createMemoryRouter([{ path: '*', element: children }], {
      initialEntries: ['/routines/1', '/routines/1/edit'],
      initialIndex: 1,
    })
    return <RouterProvider router={router} />
  }
  const { result } = renderHook(() => useLeave(), { wrapper })
  return { router, leave: () => act(() => result.current('/routines')) }
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe('useLeave', () => {
  // An edit returns to wherever it was opened from, rather than pushing a
  // screen on top of itself for back to walk into.
  test('goes back when there is history', async () => {
    window.history.replaceState({ idx: 1 }, '', '/')
    const { router, leave } = open()

    await leave()

    expect(router.state.location.pathname).toBe('/routines/1')
    expect(router.state.historyAction).toBe('POP')
  })

  // Opened from a link, there is nothing to go back through; the fallback
  // takes the finished screen's place so back cannot land on it.
  test('replaces itself with the fallback without history', async () => {
    window.history.replaceState({ idx: 0 }, '', '/')
    const { router, leave } = open()

    await leave()

    expect(router.state.location.pathname).toBe('/routines')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
