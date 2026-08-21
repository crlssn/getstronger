import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import AppCard from './AppCard'

describe('AppCard', () => {
  test('renders its children inside a card', () => {
    render(
      <AppCard>
        <p>Streak: 4 weeks</p>
      </AppCard>,
    )

    expect(screen.getByText('Streak: 4 weeks').parentElement).toHaveClass('card')
  })
})
