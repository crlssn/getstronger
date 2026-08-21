// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { NotFound } from './NotFound'

describe('NotFound', () => {
  test('says the page is not there, in the reader’s language', () => {
    renderWithProviders(<NotFound />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found')
    expect(screen.getByText(/couldn’t find the page/)).toBeInTheDocument()
  })
})
