// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppLoadMore } from './AppLoadMore'

describe('AppLoadMore', () => {
  test('fetches the next page when pressed', async () => {
    const onFetch = vi.fn()
    render(<AppLoadMore label="Load more exercises" onFetch={onFetch} />)

    await userEvent.click(screen.getByRole('button', { name: 'Load more exercises' }))

    expect(onFetch).toHaveBeenCalledOnce()
  })

  // A second press while the first page is still in flight appends it twice.
  test('does not fetch again while it is loading', async () => {
    const onFetch = vi.fn()
    render(<AppLoadMore label="Load more" onFetch={onFetch} loading />)

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(onFetch).not.toHaveBeenCalled()
  })

  test('announces that it is loading', () => {
    render(<AppLoadMore label="Load more" onFetch={vi.fn()} loading />)

    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})
