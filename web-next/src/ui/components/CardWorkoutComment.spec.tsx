// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { UserSchema } from '@/proto/api/v1/shared_pb'
import { renderWithProviders } from '@/ui/testing'
import { CardWorkoutComment } from './CardWorkoutComment'

const user = create(UserSchema, { id: 'user-1', name: 'Alex Morgan', username: 'alex' })

describe('CardWorkoutComment', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows who said it, when, and what they said', () => {
    renderWithProviders(
      <CardWorkoutComment
        comment="Strong session"
        user={user}
        timestamp={timestampFromDate(new Date('2026-08-14T10:00:00Z'))}
      />,
    )

    expect(screen.getByRole('link', { name: 'alex' })).toHaveAttribute('href', '/users/user-1')
    expect(screen.getByText('Strong session')).toBeInTheDocument()
    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
  })

  test('takes the reader to the author from the avatar too', () => {
    renderWithProviders(<CardWorkoutComment comment="Nice" user={user} />)

    expect(screen.getByRole('link', { name: 'View Alex Morgan’s profile' })).toHaveTextContent('AM')
  })

  // Rather than an empty square: a comment always has an author, even when the
  // response did not carry their name.
  test('falls back to the brand’s initials without a name', () => {
    renderWithProviders(<CardWorkoutComment comment="Nice" />)

    expect(screen.getAllByRole('link')[0]).toHaveTextContent('GS')
  })
})
