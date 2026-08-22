// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppDurationInput } from './AppDurationInput'

describe('AppDurationInput', () => {
  const Harness = ({ initial }: { initial?: number }) => {
    const [value, setValue] = useState<number | undefined>(initial)

    return (
      <>
        <AppDurationInput aria-label="Time" value={value} onChange={setValue} />
        <output>{value ?? 'none'}</output>
      </>
    )
  }

  const field = () => screen.getByRole('textbox', { name: 'Time' })

  test('opens in the canonical format', () => {
    renderWithProviders(<Harness initial={90} />)

    expect(field()).toHaveValue('1:30')
  })

  test('reads the colon form as it is typed', async () => {
    renderWithProviders(<Harness />)

    await userEvent.type(field(), '2:15')

    expect(screen.getByRole('status')).toHaveTextContent('135')
  })

  test('reads bare digits from the right', async () => {
    renderWithProviders(<Harness />)

    await userEvent.type(field(), '130')

    expect(screen.getByRole('status')).toHaveTextContent('90')
  })

  // Reformatting on every keystroke would rewrite what is being typed.
  test('leaves the text alone until the field is left', async () => {
    renderWithProviders(<Harness />)

    await userEvent.type(field(), '130')
    expect(field()).toHaveValue('130')

    await userEvent.tab()
    expect(field()).toHaveValue('1:30')
  })

  test('clears to nothing when the field is emptied', async () => {
    renderWithProviders(<Harness initial={90} />)

    await userEvent.clear(field())

    expect(screen.getByRole('status')).toHaveTextContent('none')
  })
})
