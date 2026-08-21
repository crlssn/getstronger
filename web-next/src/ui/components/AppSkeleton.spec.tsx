// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppSkeleton } from './AppSkeleton'

const lines = () => document.querySelectorAll('.loading-line')

describe('AppSkeleton', () => {
  test('shows three lines by default', () => {
    renderWithProviders(<AppSkeleton />)

    expect(lines()).toHaveLength(3)
  })

  test('shows the number of lines it is asked for', () => {
    renderWithProviders(<AppSkeleton lines={5} />)

    expect(lines()).toHaveLength(5)
  })

  // The screenshot harness waits on .loading-card to disappear before it
  // photographs a page.
  test('carries the settle sentinel the screenshot harness waits on', () => {
    renderWithProviders(<AppSkeleton />)

    expect(document.querySelector('.loading-card')).toBeInTheDocument()
  })

  // A screen reader gets one announcement rather than a run of empty divs.
  test('announces that it is loading', () => {
    renderWithProviders(<AppSkeleton />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    lines().forEach((line) => expect(line).toHaveAttribute('aria-hidden', 'true'))
  })

  // The last line runs full width; the others are staggered.
  test('runs the last line to full width', () => {
    renderWithProviders(<AppSkeleton lines={3} />)

    const all = [...lines()]
    expect(all.at(-1)).toHaveClass('w-full')
    expect(all[0]).not.toHaveClass('w-full')
  })
})
