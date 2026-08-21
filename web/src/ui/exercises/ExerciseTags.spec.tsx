// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ExerciseTags } from './ExerciseTags'

describe('ExerciseTags', () => {
  test('renders one chip per tag', () => {
    render(<ExerciseTags tags={['Chest', 'Push']} />)

    expect(screen.getByText('Chest')).toBeInTheDocument()
    expect(screen.getByText('Push')).toBeInTheDocument()
  })

  // Nothing at all rather than an empty container: an untagged exercise must
  // not leave a gap in the row it sits in.
  test('renders nothing without tags', () => {
    const { container } = render(<ExerciseTags />)

    expect(container).toBeEmptyDOMElement()
  })

  test('marks the compact variant so a list row can use it', () => {
    const { container } = render(<ExerciseTags compact tags={['Chest']} />)
    const roomy = render(<ExerciseTags tags={['Chest']} />)

    expect(container.firstElementChild?.className).not.toBe(
      roomy.container.firstElementChild?.className,
    )
  })
})
