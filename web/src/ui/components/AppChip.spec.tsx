// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppChip } from './AppChip'

describe('AppChip', () => {
  test('carries its label', () => {
    render(<AppChip tone="record">PR</AppChip>)

    expect(screen.getByText('PR')).toBeVisible()
  })

  test('counts without a tone', () => {
    render(<AppChip>5 exercises</AppChip>)

    expect(screen.getByText('5 exercises')).toBeVisible()
  })
})
