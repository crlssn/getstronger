// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import { useAlertStore } from '@/stores/alerts'
import { AppAlert } from './AppAlert'

/** Each screen moves somewhere new, so a second press is a real navigation. */
const Screen = ({ to }: { to: string }) => {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(to)}>
      Navigate
    </button>
  )
}

const renderAt = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/home']}>
        <AppAlert />
        <Routes>
          <Route path="/home" element={<Screen to="/first" />} />
          <Route path="/first" element={<Screen to="/second" />} />
          <Route path="/second" element={<Screen to="/third" />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )

const navigate = async () => await userEvent.click(screen.getByRole('button', { name: 'Navigate' }))

describe('AppAlert', () => {
  beforeEach(() => {
    useAlertStore.setState({ alert: null })
  })

  test('shows nothing when nothing has been raised', () => {
    renderAt()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('announces a success as a status', () => {
    useAlertStore.getState().setSuccess('Workout saved')
    renderAt()

    expect(screen.getByRole('status')).toHaveTextContent('Workout saved')
  })

  // An error interrupts; a success does not.
  test('announces an error more assertively', () => {
    useAlertStore.getState().setError('Could not save')
    renderAt()

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  test('can be dismissed', async () => {
    useAlertStore.getState().setSuccess('Workout saved')
    renderAt()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // An alert raised just before a navigation has to survive it, or it is gone
  // before the screen that explains it has rendered.
  test('survives the navigation it was raised for', async () => {
    useAlertStore.getState().setSuccess('Workout saved')
    renderAt()

    await navigate()

    expect(screen.getByRole('status')).toHaveTextContent('Workout saved')
  })

  test('clears on the navigation after that', async () => {
    useAlertStore.getState().setSuccess('Workout saved')
    renderAt()

    await navigate()
    await navigate()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // An alert raised for the screen the user is already on has been seen, so
  // the next navigation is the one that clears it.
  test('clears an already-seen alert on the first navigation', async () => {
    useAlertStore.getState().setSuccessWithoutPageRefresh('Saved')
    renderAt()

    await navigate()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
