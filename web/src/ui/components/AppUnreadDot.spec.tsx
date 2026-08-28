// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { AppUnreadDot } from './AppUnreadDot'

describe('AppUnreadDot', () => {
  // The row says "unread" in words; a dot in the accessibility tree would be
  // read as nothing at all.
  test('is decoration, not content', () => {
    const { container } = render(<AppUnreadDot />)

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
