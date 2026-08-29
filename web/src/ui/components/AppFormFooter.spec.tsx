// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppButton } from './AppButton'
import { AppFormFooter } from './AppFormFooter'

const openKeyboard = () => {
  const target = new EventTarget()
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      height: window.innerHeight - 320,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    },
  })
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
})

describe('AppFormFooter', () => {
  test('pins the action it is given', () => {
    renderWithProviders(
      <AppFormFooter>
        <AppButton type="submit" colour="primary">
          Create routine
        </AppButton>
      </AppFormFooter>,
    )

    expect(screen.getByRole('button', { name: 'Create routine' })).toBeVisible()
  })

  test('announces why the last submit failed, beside the submit', () => {
    renderWithProviders(
      <AppFormFooter error="Could not save. Please try again.">
        <AppButton type="submit" colour="primary">
          Save changes
        </AppButton>
      </AppFormFooter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save. Please try again.')
  })

  test('carries a secondary action beside the primary one', () => {
    renderWithProviders(
      <AppFormFooter
        secondary={
          <AppButton type="button" colour="ghost" width="auto">
            Cancel
          </AppButton>
        }
      >
        <AppButton type="submit" colour="primary">
          Save changes
        </AppButton>
      </AppFormFooter>,
    )

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  // A disabled submit that says nothing is a dead end: the reader is left to
  // guess which of the form's fields is the one holding it shut.
  describe('the hint', () => {
    test('names what is missing, and describes the action it blocks', () => {
      renderWithProviders(
        <AppFormFooter hint="Add a name and one exercise">
          <AppButton type="submit" colour="primary" disabled>
            Create routine
          </AppButton>
        </AppFormFooter>,
      )

      const hint = screen.getByText('Add a name and one exercise')
      expect(hint).toBeVisible()
      expect(screen.getByRole('button', { name: 'Create routine' })).toHaveAttribute(
        'aria-describedby',
        hint.id,
      )
    })

    test('says nothing once nothing is missing', () => {
      renderWithProviders(
        <AppFormFooter>
          <AppButton type="submit" colour="primary">
            Create routine
          </AppButton>
        </AppFormFooter>,
      )

      expect(screen.getByRole('button', { name: 'Create routine' })).not.toHaveAttribute(
        'aria-describedby',
      )
    })
  })

  // A bar floating on the keyboard covers the field being typed into.
  test('stands down while the keyboard is up', () => {
    openKeyboard()

    act(
      () =>
        void renderWithProviders(
          <AppFormFooter>
            <AppButton type="submit" colour="primary">
              Create routine
            </AppButton>
          </AppFormFooter>,
        ),
    )

    expect(screen.queryByRole('button', { name: 'Create routine' })).not.toBeInTheDocument()
  })
})
