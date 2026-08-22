// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppPageHeader } from './AppPageHeader'

describe('AppPageHeader', () => {
  // One h1 per screen, at one size, one distance from the content below it.
  test('renders the title as the page heading', () => {
    render(<AppPageHeader title="Routines" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Routines' })).toBeInTheDocument()
  })

  test('renders the eyebrow above the title', () => {
    render(<AppPageHeader eyebrow="Training" title="Plans" />)

    expect(screen.getByText('Training')).toBeInTheDocument()
  })

  test('renders the lead paragraph', () => {
    render(<AppPageHeader title="Plans" lead="A plan is a loop of routines." />)

    expect(screen.getByText('A plan is a loop of routines.')).toBeInTheDocument()
  })

  test('renders an action beside the title', () => {
    render(<AppPageHeader title="Routines" action={<button type="button">New</button>} />)

    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })
})
