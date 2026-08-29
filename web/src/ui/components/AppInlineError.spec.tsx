import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppInlineError } from './AppInlineError'

describe('AppInlineError', () => {
  it('announces itself as an alert', () => {
    render(<AppInlineError>Could not save</AppInlineError>)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  it('carries an id so a field can be described by it', () => {
    render(<AppInlineError id="field-error">Username is taken</AppInlineError>)
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'field-error')
  })
})
