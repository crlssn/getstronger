// @vitest-environment jsdom

import { PencilIcon } from '@heroicons/react/24/outline'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { ActionButton } from './ActionButton'

describe('ActionButton', () => {
  test('runs the screen action it was given', async () => {
    const action = vi.fn()
    renderWithProviders(<ActionButton action={action} icon={PencilIcon} />)

    await userEvent.click(screen.getByRole('button'))

    expect(action).toHaveBeenCalledOnce()
  })

  // The icon is decorative; the button carries the name.
  test('is named for assistive technology', () => {
    renderWithProviders(<ActionButton action={vi.fn()} icon={PencilIcon} />)

    expect(screen.getByRole('button')).toHaveAccessibleName()
  })
})
