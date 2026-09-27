// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { Fragment } from 'react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { type Page, snapshotLimit, usePagedList } from './usePagedList'

interface Row {
  id: string
  name?: string
}

const token = (...bytes: number[]) => new Uint8Array(bytes)
const page = (ids: string[], next = token(), name?: string): Page<Row> => ({
  rows: ids.map((id) => ({ id, name })),
  pagination: { nextPageToken: next } as never,
})

const fetchPage = vi.fn<(token: Uint8Array) => Promise<Page<Row> | void>>()

const List = () => {
  const { rows, loaded, hasMorePages, fetchMore } = usePagedList('rows', fetchPage)
  if (!loaded) return <p>loading</p>

  return (
    <>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{[row.id, row.name].filter(Boolean).join(' ')}</li>
        ))}
      </ul>
      {hasMorePages && (
        <button type="button" onClick={() => void fetchMore()}>
          more
        </button>
      )}
    </>
  )
}

// The app remounts a screen when its path changes; a bare router would not.
const Keyed = () => <Fragment key={useLocation().pathname}>{<Outlet />}</Fragment>

const mount = () => {
  const router = createMemoryRouter(
    [
      {
        element: <Keyed />,
        children: [
          { path: '/list/:n', element: <List /> },
          { path: '/other', element: <p>other</p> },
        ],
      },
    ],
    { initialEntries: ['/list/0'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const rows = () => screen.queryAllByRole('listitem').map((item) => item.textContent)

// Leaves for another screen and comes back, without letting anything settle.
const visitAndReturn = async (router: ReturnType<typeof mount>) => {
  await act(() => router.navigate('/other'))
  await act(() => router.navigate(-1))
}

afterEach(() => fetchPage.mockReset())

describe('usePagedList', () => {
  test('loads the first page on arrival', async () => {
    fetchPage.mockResolvedValue(page(['a', 'b']))
    mount()

    expect(await screen.findByText('a')).toBeTruthy()
    expect(fetchPage).toHaveBeenCalledWith(token())
  })

  test('restores every page it had on a back navigation, without a loading state', async () => {
    fetchPage.mockResolvedValueOnce(page(['a', 'b'], token(1)))
    fetchPage.mockResolvedValueOnce(page(['c']))
    const router = mount()
    await screen.findByText('a')
    act(() => screen.getByRole('button', { name: 'more' }).click())
    await screen.findByText('c')

    // Never answers, so what shows is the snapshot alone.
    fetchPage.mockReturnValue(new Promise(() => {}))
    await visitAndReturn(router)

    expect(screen.queryByText('loading')).toBeNull()
    expect(rows()).toEqual(['a', 'b', 'c'])
    expect(screen.queryByRole('button', { name: 'more' })).toBeNull()
  })

  test('swaps in what changed once the quiet revalidation answers', async () => {
    fetchPage.mockResolvedValueOnce(page(['a', 'b'], token(1)))
    fetchPage.mockResolvedValueOnce(page(['c', 'd']))
    const router = mount()
    await screen.findByText('a')
    act(() => screen.getByRole('button', { name: 'more' }).click())
    await screen.findByText('d')

    // A new row on top, and the second one renamed.
    fetchPage.mockResolvedValueOnce({
      rows: [{ id: 'new' }, { id: 'a' }, { id: 'b', name: 'renamed' }],
      pagination: { nextPageToken: token(1) } as never,
    })
    await visitAndReturn(router)

    expect(fetchPage).toHaveBeenLastCalledWith(token())
    expect(await screen.findByText('new')).toBeTruthy()
    expect(rows()).toEqual(['new', 'a', 'b renamed', 'c', 'd'])
  })

  test('starts over from the fresh page when it no longer reaches the restored rows', async () => {
    fetchPage.mockResolvedValueOnce(page(['a', 'b']))
    const router = mount()
    await screen.findByText('a')

    fetchPage.mockResolvedValueOnce(page(['x', 'y'], token(2)))
    await visitAndReturn(router)

    expect(await screen.findByText('x')).toBeTruthy()
    expect(rows()).toEqual(['x', 'y'])
    expect(screen.getByRole('button', { name: 'more' })).toBeTruthy()
  })

  test('keeps the restored page when the revalidation fails', async () => {
    fetchPage.mockResolvedValueOnce(page(['a', 'b']))
    const router = mount()
    await screen.findByText('a')

    fetchPage.mockResolvedValueOnce(undefined)
    await visitAndReturn(router)
    await act(async () => {})

    expect(rows()).toEqual(['a', 'b'])
  })

  test('loads fresh when the screen is arrived at forwards', async () => {
    fetchPage.mockResolvedValueOnce(page(['a']))
    const router = mount()
    await screen.findByText('a')

    fetchPage.mockReturnValue(new Promise(() => {}))
    await act(() => router.navigate('/other'))
    await act(() => router.navigate('/list/0'))

    expect(screen.getByText('loading')).toBeTruthy()
  })

  test('forgets every page on logout', async () => {
    fetchPage.mockResolvedValueOnce(page(['a']))
    const router = mount()
    await screen.findByText('a')
    await act(() => router.navigate('/other'))

    act(() => useAuthStore.getState().logout())
    fetchPage.mockReturnValue(new Promise(() => {}))
    await act(() => router.navigate(-1))

    expect(screen.getByText('loading')).toBeTruthy()
  })

  test(`holds only the last ${snapshotLimit} lists`, async () => {
    fetchPage.mockResolvedValue(page(['a']))
    const router = mount()
    await screen.findByText('a')
    for (let n = 1; n <= snapshotLimit; n += 1) {
      await act(() => router.navigate(`/list/${n}`))
      await screen.findByText('a')
    }

    fetchPage.mockReturnValue(new Promise(() => {}))
    await act(() => router.navigate(-1))
    expect(rows()).toEqual(['a'])

    await act(() => router.navigate(-(snapshotLimit - 1)))
    expect(screen.getByText('loading')).toBeTruthy()
  })
})
