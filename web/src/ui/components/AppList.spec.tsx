// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppList } from './AppList'
import { AppListRow } from './AppListRow'

let reach: () => void

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        reach = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as never)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const rows = (
  <>
    <AppListRow title="Bench press" />
    <AppListRow title="Squat" />
  </>
)

describe('AppList', () => {
  test('renders its rows as a list', () => {
    renderWithProviders(<AppList>{rows}</AppList>)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  // The spinner row is the scroll sentinel, so it only exists while there is
  // another page to reach.
  test('shows no spinner when there is nothing more to fetch', () => {
    renderWithProviders(<AppList>{rows}</AppList>)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  test('shows a spinner row while another page exists', () => {
    renderWithProviders(<AppList canFetch>{rows}</AppList>)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  test('fetches when the reader scrolls to the end', () => {
    const onFetch = vi.fn()
    renderWithProviders(
      <AppList canFetch onFetch={onFetch}>
        {rows}
      </AppList>,
    )

    reach()

    expect(onFetch).toHaveBeenCalledOnce()
  })

  test('does not fetch when there is nothing more to fetch', () => {
    const onFetch = vi.fn()
    renderWithProviders(<AppList onFetch={onFetch}>{rows}</AppList>)

    expect(onFetch).not.toHaveBeenCalled()
  })

  test('keeps its own classes when given one', () => {
    renderWithProviders(<AppList className="mt-8">{rows}</AppList>)

    expect(screen.getByRole('list')).toHaveClass('mt-8')
  })

  test('labels a section with its heading', () => {
    renderWithProviders(<AppList heading="Danger zone">{rows}</AppList>)

    expect(screen.getByRole('list', { name: 'Danger zone' })).toBeInTheDocument()
    expect(screen.getByText('Danger zone')).toBeInTheDocument()
  })

  // The heading names the list, so a screen reader that also read it as the
  // first row would announce the section twice.
  test('hides the heading row from the rows it labels', () => {
    renderWithProviders(<AppList heading="Danger zone">{rows}</AppList>)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  test('draws no heading row without one', () => {
    renderWithProviders(<AppList>{rows}</AppList>)

    expect(screen.getByRole('list')).not.toHaveAccessibleName()
  })
})
