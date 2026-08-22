// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { PrivacyPolicy } from './PrivacyPolicy'

describe('PrivacyPolicy', () => {
  test('says what is stored, why, and who else sees it', () => {
    renderWithProviders(<PrivacyPolicy />, { route: '/privacy' })

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument()
    for (const section of [
      'What we store',
      'Why we store it',
      'Who else sees it',
      'How long we keep it',
      'Your choices',
      'Cookies and on-device storage',
      'Changes',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument()
    }
  })

  // The stores read this page to fill in the privacy questionnaires, so the
  // two routes out of it — deletion and a human to ask — have to be on it.
  test('points at account deletion and a contact address', () => {
    renderWithProviders(<PrivacyPolicy />, { route: '/privacy' })

    expect(screen.getByText(/Delete account/)).toBeInTheDocument()
    expect(screen.getByText(/privacy@getstronger\.studio/)).toBeInTheDocument()
  })
})
