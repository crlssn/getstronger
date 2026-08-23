// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { maxTags } from '@/utils/exerciseTags'
import { ExerciseTagsInput } from './ExerciseTagsInput'

const suggestions = ['Chest', 'Chest press', 'Upper chest']

/** The field is controlled, so a spec needs something holding its value. */
const Harness = ({ initial = [] as string[], onChange = vi.fn() }) => {
  const [tags, setTags] = useState(initial)

  return (
    <ExerciseTagsInput
      value={tags}
      suggestions={suggestions}
      onChange={(next) => {
        setTags(next)
        onChange(next)
      }}
    />
  )
}

const field = () => screen.getByRole('combobox', { name: 'Add exercise tag' })
const options = () => screen.queryAllByRole('option')

describe('ExerciseTagsInput', () => {
  test('adds a typed tag on enter', async () => {
    renderWithProviders(<Harness />)

    await userEvent.type(field(), 'Push{Enter}')

    expect(screen.getByRole('button', { name: 'Remove Push' })).toBeInTheDocument()
    expect(field()).toHaveValue('')
  })

  test('adds a tag on a comma too', async () => {
    renderWithProviders(<Harness />)

    await userEvent.type(field(), 'Push,Pull,')

    expect(screen.getByRole('button', { name: 'Remove Push' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Pull' })).toBeInTheDocument()
  })

  // Leaving the field with a half-typed tag should not silently lose it.
  test('commits what was typed when the field is left', async () => {
    renderWithProviders(<Harness />)

    await userEvent.type(field(), 'Push')
    await userEvent.tab()

    expect(screen.getByRole('button', { name: 'Remove Push' })).toBeInTheDocument()
  })

  test('removes a tag', async () => {
    renderWithProviders(<Harness initial={['Push']} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Push' }))

    expect(screen.queryByRole('button', { name: 'Remove Push' })).not.toBeInTheDocument()
  })

  // The whole chip removes, not just the ✕ drawn inside it: a 24px ✕ is half
  // the tap-target floor, and the chip is the only box around it big enough.
  test('removes a tag from anywhere on the chip', async () => {
    renderWithProviders(<Harness initial={['Push']} />)

    await userEvent.click(screen.getByText('Push'))

    expect(screen.queryByRole('button', { name: 'Remove Push' })).not.toBeInTheDocument()
  })

  test('counts the tags against the limit', async () => {
    renderWithProviders(<Harness initial={['Push']} />)

    expect(screen.getByText(`1/${maxTags}`)).toBeInTheDocument()
  })

  test('takes the field away once the limit is reached', () => {
    const full = Array.from({ length: maxTags }, (_, index) => `Tag ${index}`)
    renderWithProviders(<Harness initial={full} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  describe('suggestions', () => {
    test('appear only once something is typed', async () => {
      renderWithProviders(<Harness />)

      await userEvent.click(field())
      expect(options()).toHaveLength(0)

      await userEvent.type(field(), 'chest')
      expect(options().map((option) => option.textContent)).toEqual([
        'ChestExisting tag',
        'Chest pressExisting tag',
        'Upper chestExisting tag',
      ])
    })

    test('can be picked with the pointer', async () => {
      renderWithProviders(<Harness />)

      await userEvent.type(field(), 'chest')
      await userEvent.click(screen.getByRole('option', { name: /Chest press/ }))

      expect(screen.getByRole('button', { name: 'Remove Chest press' })).toBeInTheDocument()
    })

    test('can be walked through with the arrow keys and taken with enter', async () => {
      renderWithProviders(<Harness />)

      await userEvent.type(field(), 'chest{ArrowDown}{ArrowDown}{Enter}')

      expect(screen.getByRole('button', { name: 'Remove Chest press' })).toBeInTheDocument()
    })

    // Nothing highlighted sits before the first option, so up from there is the
    // last one — the Vue field landed on the second.
    test('wraps around at both ends', async () => {
      renderWithProviders(<Harness />)

      await userEvent.type(field(), 'chest{ArrowUp}{Enter}')
      expect(screen.getByRole('button', { name: 'Remove Upper chest' })).toBeInTheDocument()

      await userEvent.type(field(), 'chest{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
      expect(screen.getByRole('button', { name: 'Remove Chest' })).toBeInTheDocument()
    })

    test('marks the highlighted option for a screen reader', async () => {
      renderWithProviders(<Harness />)

      await userEvent.type(field(), 'chest{ArrowDown}')

      expect(options()[0]).toHaveAttribute('aria-selected', 'true')
      expect(options()[1]).toHaveAttribute('aria-selected', 'false')
    })

    test('drops one that is already chosen', async () => {
      renderWithProviders(<Harness initial={['Chest']} />)

      await userEvent.type(field(), 'chest')

      expect(options().map((option) => option.textContent)).toEqual([
        'Chest pressExisting tag',
        'Upper chestExisting tag',
      ])
    })
  })

  describe('what it refuses', () => {
    test('says a tag is already there rather than adding it twice', async () => {
      renderWithProviders(<Harness initial={['Push']} />)

      await userEvent.type(field(), 'push{Enter}')

      expect(screen.getByText('“push” is already added.')).toBeInTheDocument()
      expect(screen.getByText(`1/${maxTags}`)).toBeInTheDocument()
    })

    test('clears the complaint when a tag is removed', async () => {
      renderWithProviders(<Harness initial={['Push']} />)

      await userEvent.type(field(), 'push{Enter}')
      expect(screen.getByText('“push” is already added.')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Remove Push' }))
      expect(screen.queryByText('“push” is already added.')).not.toBeInTheDocument()
    })
  })

  // axe rejected aria-expanded on a plain textbox: the attribute is only
  // allowed once the field says it owns a popup.
  test('is a combobox, which is what its expanded state describes', async () => {
    renderWithProviders(<Harness />)

    const field = screen.getByRole('combobox')
    expect(field).toHaveAttribute('aria-expanded', 'false')

    await userEvent.type(field, 'ch')

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox').id,
    )
  })
})
