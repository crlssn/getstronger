// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppPreferenceRow } from './AppPreferenceRow'
import { AppSwitch } from './AppSwitch'

describe('AppPreferenceRow', () => {
  test('reads as the preference, and carries its control', () => {
    renderWithProviders(
      <AppPreferenceRow
        title="Repeat my last set"
        body="Fills an empty field with what you lifted last time"
        control={<AppSwitch checked={false} label="Repeat my last set" onChange={() => {}} />}
      />,
    )

    expect(screen.getByText('Repeat my last set')).toBeInTheDocument()
    expect(
      screen.getByText('Fills an empty field with what you lifted last time'),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Repeat my last set' })).toBeInTheDocument()
  })

  // The control has already snapped back by the time this renders, so without
  // the line beside it the row appears to have changed its own mind.
  test('says why a change did not save, on the row it was made on', () => {
    renderWithProviders(
      <AppPreferenceRow
        title="Preferred weight unit"
        control={<span />}
        error="Could not update weight unit. Please try again."
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Could not update weight unit')
  })

  test('draws no error line when the last change saved', () => {
    renderWithProviders(<AppPreferenceRow title="Preferred weight unit" control={<span />} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
