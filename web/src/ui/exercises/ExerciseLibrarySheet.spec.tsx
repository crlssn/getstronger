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
import { ExerciseLibrarySheet } from './ExerciseLibrarySheet'

const entry = (key: string, en: string, sv: string): LibraryExercise => ({
  key,
  names: { en, sv },
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  equipment: ['barbell'],
  tags: ['legs', 'squat'],
})

const squat = entry('barbell-back-squat', 'Barbell back squat', 'Knäböj med skivstång')
const bench = entry('barbell-bench-press', 'Barbell bench press', 'Bänkpress med skivstång')

const loadLibrary = vi.mocked(library.loadLibrary)
const search = () => screen.getByRole('searchbox', { name: 'Search the library' })

beforeEach(async () => {
  loadLibrary.mockReset()
  loadLibrary.mockResolvedValue([squat, bench])
  await i18n.changeLanguage('en')
})

afterEach(async () => i18n.changeLanguage('en'))

describe('ExerciseLibrarySheet', () => {
  test('opens on the whole library, so there is something to browse', async () => {
    renderWithProviders(<ExerciseLibrarySheet onPick={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /Barbell back squat/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Barbell bench press/ })).toBeInTheDocument()
  })

  test('narrows to what the search matches', async () => {
    renderWithProviders(<ExerciseLibrarySheet onPick={vi.fn()} onClose={vi.fn()} />)

    await screen.findByRole('button', { name: /Barbell bench press/ })
    await userEvent.type(search(), 'squat')
    expect(screen.getByRole('button', { name: /Barbell back squat/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /bench press/ })).not.toBeInTheDocument()
  })

  test('reads the entry in the reader’s locale, and matches on English anyway', async () => {
    await i18n.changeLanguage('sv')
    renderWithProviders(<ExerciseLibrarySheet onPick={vi.fn()} onClose={vi.fn()} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Sök i biblioteket' }), 'bench')
    expect(
      await screen.findByRole('button', { name: /Bänkpress med skivstång/ }),
    ).toBeInTheDocument()
  })

  test('says so when nothing matches', async () => {
    renderWithProviders(<ExerciseLibrarySheet onPick={vi.fn()} onClose={vi.fn()} />)

    await screen.findByRole('button', { name: /Barbell bench press/ })
    await userEvent.type(search(), 'tuesday finisher')
    expect(screen.getByText('No matching exercises')).toBeInTheDocument()
  })

  test('hands the whole entry over when one is tapped', async () => {
    const onPick = vi.fn()
    renderWithProviders(<ExerciseLibrarySheet onPick={onPick} onClose={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: /Barbell back squat/ }))
    expect(onPick).toHaveBeenCalledWith(squat)
  })

  // Offline, the chunk may never arrive. An empty list would read as a library
  // with nothing in it, which is the one thing it is not.
  test('offers a retry when the catalogue cannot be fetched', async () => {
    loadLibrary.mockRejectedValueOnce(new Error('offline'))
    renderWithProviders(<ExerciseLibrarySheet onPick={vi.fn()} onClose={vi.fn()} />)

    const retry = await screen.findByRole('button', { name: /Try again/i })
    await userEvent.click(retry)

    expect(await screen.findByRole('button', { name: /Barbell back squat/ })).toBeInTheDocument()
  })

  test('closes when asked', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ExerciseLibrarySheet onPick={vi.fn()} onClose={onClose} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Close the library' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
