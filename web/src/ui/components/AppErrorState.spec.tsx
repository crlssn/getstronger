// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppErrorState } from './AppErrorState'

describe('AppErrorState', () => {
  test('says the fetch failed rather than that there is nothing', () => {
    renderWithProviders(<AppErrorState onRetry={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  })

  test('takes the screen’s own words for what failed', () => {
    renderWithProviders(
      <AppErrorState title="Followers could not be loaded" body="Try again." onRetry={vi.fn()} />,
    )

    expect(
      screen.getByRole('heading', { name: 'Followers could not be loaded' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Try again.')).toBeInTheDocument()
  })

  // The rule this component exists to enforce: a failure always offers a retry.
  test('retries when the button is pressed', async () => {
    const onRetry = vi.fn()
    renderWithProviders(<AppErrorState onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  test('collapses to a single row under content that did arrive', () => {
    renderWithProviders(<AppErrorState compact title="The next page failed" onRetry={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('The next page failed')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
