// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'

import { brandName, brandSlogan } from '@/brand'
import { useAlertStore } from '@/stores/alerts'
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
  beforeEach(() => {
    useAlertStore.setState({ alert: null })
  })

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

  // A failed sign-in has to be readable on the screen that caused it.
  test('carries the alert region', () => {
    useAlertStore.getState().setError('Those details did not match')
    renderAt()

    expect(screen.getByRole('alert')).toHaveTextContent('Those details did not match')
  })

  test('narrows the alert to the same column as the form', () => {
    useAlertStore.getState().setError('Those details did not match')
    renderAt()

    expect(screen.getByRole('alert').firstElementChild?.className).toContain('guestAlert')
  })
})
