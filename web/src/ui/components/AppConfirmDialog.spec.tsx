// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'

import { useConfirmationStore } from '@/stores/confirmation'
import { renderWithProviders } from '@/ui/testing'
import { AppConfirmDialog } from './AppConfirmDialog'

const ask = (options: Parameters<ReturnType<typeof useConfirmationStore.getState>['confirm']>[0]) =>
  useConfirmationStore.getState().confirm(options)

const request = { title: 'Delete this exercise?', confirmLabel: 'Delete' }

describe('AppConfirmDialog', () => {
  beforeEach(() => {
    useConfirmationStore.setState({ confirmation: null, resolver: null })
  })

  test('shows nothing until something asks', () => {
    renderWithProviders(<AppConfirmDialog />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('asks the question it was given', () => {
    void ask({ ...request, body: 'Its workout history is kept.' })
    renderWithProviders(<AppConfirmDialog />)

    expect(screen.getByRole('heading', { name: 'Delete this exercise?' })).toBeInTheDocument()
    expect(screen.getByText('Its workout history is kept.')).toBeInTheDocument()
  })

  test('answers true when confirmed', async () => {
    const answer = ask(request)
    renderWithProviders(<AppConfirmDialog />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await expect(answer).resolves.toBe(true)
  })

  test('answers false when cancelled', async () => {
    const answer = ask(request)
    renderWithProviders(<AppConfirmDialog />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await expect(answer).resolves.toBe(false)
  })

  test('falls back to a generic cancel label', () => {
    void ask(request)
    renderWithProviders(<AppConfirmDialog />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  test('takes a cancel label of its own', () => {
    void ask({ ...request, cancelLabel: 'Keep it' })
    renderWithProviders(<AppConfirmDialog />)

    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  })

  // A destructive answer must not look like the safe one.
  test('ranks a destructive confirm as danger', () => {
    void ask({ ...request, destructive: true })
    renderWithProviders(<AppConfirmDialog />)

    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('danger')
  })

  test('ranks an ordinary confirm as primary', () => {
    void ask({ ...request, confirmLabel: 'Save' })
    renderWithProviders(<AppConfirmDialog />)

    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('primary')
  })

  test('answers false on Escape', async () => {
    const answer = ask(request)
    renderWithProviders(<AppConfirmDialog />)

    await userEvent.keyboard('{Escape}')

    await expect(answer).resolves.toBe(false)
  })
})
