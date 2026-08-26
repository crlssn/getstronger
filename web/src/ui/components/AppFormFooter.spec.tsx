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
