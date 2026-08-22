// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'

import { brandName, brandSlogan } from '@/brand'
import { renderWithProviders } from '@/ui/testing'
import { GuestView } from './GuestView'

const renderAt = (route = '/login') =>
  renderWithProviders(
    <Routes>
      <Route element={<GuestView />}>
        <Route path="*" element={<p>The form</p>} />
      </Route>
    </Routes>,
    { route },
  )

describe('GuestView', () => {
  test('renders the screen it wraps', () => {
    renderAt()

    expect(screen.getByText('The form')).toBeInTheDocument()
  })

  test('shows the brand and its slogan', () => {
    renderAt()

    expect(screen.getByText(brandSlogan)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(brandName) })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  // The mark is decoration beside a wordmark that already says the name, so
  // an empty alt keeps it out of the accessibility tree entirely.
  test('hides the brand mark from screen readers', () => {
    renderAt()

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('img')).toHaveAttribute('alt', '')
  })
})
