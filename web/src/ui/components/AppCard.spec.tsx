// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppCard } from './AppCard'

describe('AppCard', () => {
  test('wraps its children in the shared card shape', () => {
    render(<AppCard>{'Workout summary'}</AppCard>)

    const card = screen.getByText('Workout summary')
    expect(card).toHaveClass('card')
  })

  // Callers space cards from outside; their class must not replace the shape.
  test('keeps the card class when given another', () => {
    render(<AppCard className="mt-8">{'Workout summary'}</AppCard>)

    const card = screen.getByText('Workout summary')
    expect(card).toHaveClass('card')
    expect(card).toHaveClass('mt-8')
  })

  test('passes other attributes through', () => {
    render(<AppCard data-testid="summary">{'Workout summary'}</AppCard>)

    expect(screen.getByTestId('summary')).toBeInTheDocument()
  })
})
