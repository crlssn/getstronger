// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppEmptyInline } from './AppEmptyInline'

describe('AppEmptyInline', () => {
  test('says the one thing it has to say', () => {
    render(<AppEmptyInline>Your completed workouts will appear here.</AppEmptyInline>)

    expect(screen.getByText('Your completed workouts will appear here.')).toBeVisible()
  })

  // The card it sits in has the heading. A second one inside would outrank it.
  test('is not a heading', () => {
    render(<AppEmptyInline>Nothing here yet…</AppEmptyInline>)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
