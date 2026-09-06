// @vitest-environment jsdom

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/exercises/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/exercises/library')>()),
  loadLibrary: vi.fn(),
}))

import type { LibraryExercise } from '@/exercises/types'

import * as library from '@/exercises/library'
import { i18n } from '@/i18n'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { renderWithProviders } from '@/ui/testing'
import { ExerciseLibrarySuggestions } from './ExerciseLibrarySuggestions'

const squat: LibraryExercise = {
  key: 'barbell-back-squat',
  names: { en: 'Barbell back squat', sv: 'Knäböj med skivstång' },
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  equipment: ['barbell'],
  tags: ['legs', 'squat'],
}

const loadLibrary = vi.mocked(library.loadLibrary)

beforeEach(async () => {
  loadLibrary.mockReset()
  loadLibrary.mockResolvedValue([squat])
  await i18n.changeLanguage('en')
})

afterEach(async () => i18n.changeLanguage('en'))

describe('ExerciseLibrarySuggestions', () => {
  test('fetches nothing until there is enough typed to search', () => {
    renderWithProviders(<ExerciseLibrarySuggestions query="b" onPick={vi.fn()} />)

    expect(loadLibrary).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  test('offers what the typed name matches', async () => {
    renderWithProviders(<ExerciseLibrarySuggestions query="back squ" onPick={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /Barbell back squat/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'From the library' })).toBeInTheDocument()
  })

  test('reads the entry in the reader’s locale, and matches on English anyway', async () => {
    await i18n.changeLanguage('sv')
    renderWithProviders(<ExerciseLibrarySuggestions query="squat" onPick={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /Knäböj med skivstång/ })).toBeInTheDocument()
  })

  test('hands the whole entry over when one is tapped', async () => {
    const onPick = vi.fn()
    renderWithProviders(<ExerciseLibrarySuggestions query="back squ" onPick={onPick} />)

    await userEvent.click(await screen.findByRole('button', { name: /Barbell back squat/ }))
    expect(onPick).toHaveBeenCalledWith(squat)
  })

  // Offline, the chunk may never arrive. The form still works; it just has
  // nothing to suggest.
  test('says nothing when the catalogue cannot be fetched', async () => {
    loadLibrary.mockRejectedValue(new Error('offline'))
    renderWithProviders(<ExerciseLibrarySuggestions query="back squ" onPick={vi.fn()} />)

    await waitFor(() => expect(loadLibrary).toHaveBeenCalled())
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
