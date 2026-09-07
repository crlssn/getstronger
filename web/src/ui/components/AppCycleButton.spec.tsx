// @vitest-environment jsdom

import { SpeakerWaveIcon } from '@heroicons/react/24/outline'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppCycleButton } from './AppCycleButton'

describe('AppCycleButton', () => {
  test('shows the value now and names the tap that changes it', async () => {
    const user = userEvent.setup()
    const step = vi.fn()
    render(
      <AppCycleButton
        icon={SpeakerWaveIcon}
        label="Voice volume: Low. Tap to change"
        onClick={step}
      >
        Low
      </AppCycleButton>,
    )

    const control = screen.getByRole('button', { name: 'Voice volume: Low. Tap to change' })
    expect(control).toHaveTextContent('Low')
    await user.click(control)

    expect(step).toHaveBeenCalledOnce()
  })

  test('does not step while it is disabled', async () => {
    const user = userEvent.setup()
    const step = vi.fn()
    render(
      <AppCycleButton
        icon={SpeakerWaveIcon}
        label="Voice volume: Off. Tap to change"
        active={false}
        disabled
        onClick={step}
      >
        Off
      </AppCycleButton>,
    )

    await user.click(screen.getByRole('button', { name: 'Voice volume: Off. Tap to change' }))

    expect(step).not.toHaveBeenCalled()
  })
})
