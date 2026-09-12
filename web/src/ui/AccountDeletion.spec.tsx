// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AccountDeletion } from './AccountDeletion'

describe('AccountDeletion', () => {
  // Google's Data safety form wants one public URL that answers the whole
  // question: how to ask, what goes, and what is left behind.
  test('answers how to ask, what goes, and what is kept', () => {
    renderWithProviders(<AccountDeletion />, { route: '/delete-account' })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Delete your account' }),
    ).toBeInTheDocument()
    for (const section of [
      'Delete it from the app',
      'If you cannot open the app',
      'What is deleted',
      'What is kept, and for how long',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument()
    }
  })

  // Whoever reads this has usually uninstalled the app already, so the address
  // is the only route they have left.
  test('gives an address to ask from outside the app', () => {
    renderWithProviders(<AccountDeletion />, { route: '/delete-account' })

    expect(screen.getByText(/privacy@getstronger\.studio/)).toBeInTheDocument()
  })

  test('links to the privacy policy', () => {
    renderWithProviders(<AccountDeletion />, { route: '/delete-account' })

    expect(screen.getByRole('link', { name: 'Read the privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })
})
