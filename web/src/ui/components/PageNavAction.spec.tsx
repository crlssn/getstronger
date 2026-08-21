// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { usePageNavActionStore } from '@/stores/pageNavAction'
import { renderWithProviders } from '@/ui/testing'
import { AppNavTop } from './AppNavTop'
import { PageNavAction } from './PageNavAction'

afterEach(() => {
  usePageNavActionStore.setState({ container: null })
})

describe('PageNavAction', () => {
  test('renders into the slot the nav bar published', () => {
    const slot = document.createElement('div')
    usePageNavActionStore.setState({ container: slot })

    render(<PageNavAction>chip</PageNavAction>)

    expect(slot).toHaveTextContent('chip')
  })

  // A screen may be shown without a nav bar above it, and must not fall over
  // or leave its action stranded in the page body when it is.
  test('renders nothing when no nav bar is mounted', () => {
    const { container } = render(<PageNavAction>chip</PageNavAction>)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('chip')).not.toBeInTheDocument()
  })

  test('reaches the slot of a nav bar rendered above it', () => {
    renderWithProviders(
      <>
        <AppNavTop />
        <PageNavAction>chip</PageNavAction>
      </>,
      { route: '/progress' },
    )

    expect(document.getElementById('page-nav-action')).toHaveTextContent('chip')
  })

  test('lets go of the slot when the nav bar unmounts', () => {
    const view = renderWithProviders(<AppNavTop />, { route: '/progress' })
    expect(usePageNavActionStore.getState().container).not.toBeNull()

    view.unmount()
    expect(usePageNavActionStore.getState().container).toBeNull()
  })
})
