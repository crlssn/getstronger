// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { emptyPageToken, resolvePageToken, usePagination } from './usePagination'

const token = (...bytes: number[]) => new Uint8Array(bytes)

describe('resolvePageToken', () => {
  test('takes the token from the response', () => {
    expect(resolvePageToken({ nextPageToken: token(1, 2) } as never)).toEqual(token(1, 2))
  })

  // The API sends an empty token for the last page, and no response at all
  // when the request failed; both mean there is nothing more to ask for.
  test.each([
    ['no response', undefined],
    ['an empty token', { nextPageToken: token() }],
    ['no token', {}],
  ])('reports the end for %s', (_label, response) => {
    expect(resolvePageToken(response as never)).toEqual(emptyPageToken)
  })
})

describe('usePagination', () => {
  test('starts with no more pages', () => {
    const { result } = renderHook(() => usePagination())

    expect(result.current.hasMorePages).toBe(false)
    expect(result.current.pageToken).toEqual(emptyPageToken)
  })

  test('has more pages once a response carries a token', () => {
    const { result } = renderHook(() => usePagination())

    act(() => result.current.setFromResponse({ nextPageToken: token(1) } as never))

    expect(result.current.hasMorePages).toBe(true)
    expect(result.current.pageToken).toEqual(token(1))
  })

  test('stops once a response carries none', () => {
    const { result } = renderHook(() => usePagination())
    act(() => result.current.setFromResponse({ nextPageToken: token(1) } as never))

    act(() => result.current.setFromResponse({ nextPageToken: token() } as never))

    expect(result.current.hasMorePages).toBe(false)
  })

  test('resets back to the first page', () => {
    const { result } = renderHook(() => usePagination())
    act(() => result.current.setPageToken(token(1)))

    act(() => result.current.reset())

    expect(result.current.hasMorePages).toBe(false)
  })

  // The scroll sentinel can fire again in the same tick the token was set,
  // before React has re-rendered, and would otherwise refetch the page it just
  // read.
  test('reports the token it was just given, before the re-render', () => {
    const { result } = renderHook(() => usePagination())

    act(() => {
      result.current.setPageToken(token(7))
      expect(result.current.currentPageToken()).toEqual(token(7))
    })

    expect(result.current.pageToken).toEqual(token(7))
  })
})
