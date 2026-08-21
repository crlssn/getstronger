import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import '@/i18n'
import AppSkeleton from './AppSkeleton'

describe('AppSkeleton', () => {
  test('renders a pulsating card with three lines by default', () => {
    const { container } = render(<AppSkeleton />)

    expect(container.querySelector('.loading-card')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.loading-line')).toHaveLength(3)
  })

  test('announces loading to screen readers', () => {
    render(<AppSkeleton />)

    expect(screen.getByText('Loading…')).toHaveClass('sr-only')
  })

  test('renders as many lines as asked for', () => {
    const { container } = render(<AppSkeleton lines={5} />)

    expect(container.querySelectorAll('.loading-line')).toHaveLength(5)
  })
})
