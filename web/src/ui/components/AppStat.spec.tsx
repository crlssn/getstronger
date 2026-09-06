// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppStat } from './AppStat'

describe('AppStat', () => {
  test('names the figure and carries its unit', () => {
    render(<AppStat label="Distance" value="5.33" unit="km" />)

    expect(screen.getByText('Distance')).toBeVisible()
    expect(screen.getByText('km')).toBeVisible()
  })

  test('reads without a unit', () => {
    render(<AppStat label="Sets logged" value="12" size="md" tone="record" />)

    expect(screen.getByText('12')).toBeVisible()
  })
})
