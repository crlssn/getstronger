// @vitest-environment jsdom

import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders as render } from '@/ui/testing'
import { AppCarousel } from './AppCarousel'

const slides = [
  { key: 'a', label: 'Lower body', content: <p>Lower body</p> },
  { key: 'b', label: 'Push day', content: <p>Push day</p> },
  { key: 'c', label: 'Pull day', content: <p>Pull day</p> },
]

// jsdom lays nothing out, so every panel sits at offset zero and the track
// never moves. Giving each panel a width is what lets a scroll say which one
// the row stopped on.
const layOut = (track: HTMLElement, width: number) => {
  Array.from(track.children).forEach((slide, index) => {
    Object.defineProperty(slide, 'offsetLeft', { configurable: true, value: index * width })
  })
  track.scrollTo = vi.fn()
  return track
}

const scrollTo = (track: HTMLElement, left: number) => {
  Object.defineProperty(track, 'scrollLeft', { configurable: true, value: left })
  fireEvent.scroll(track)
}

// A dot says what it goes to and where that is: two panels can share a name.
const dot = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) })

describe('AppCarousel', () => {
  test('names the row and lists its panels', () => {
    render(<AppCarousel label="Your routines" slides={slides} />)

    const track = screen.getByRole('list', { name: 'Your routines' })
    expect(within(track).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Push day')).toBeInTheDocument()
  })

  test('says which panel the row has stopped on', () => {
    render(<AppCarousel label="Your routines" slides={slides} />)
    const track = layOut(screen.getByRole('list', { name: 'Your routines' }), 300)

    expect(dot('Lower body')).toHaveAttribute('aria-current', 'true')

    scrollTo(track, 300)
    expect(dot('Push day')).toHaveAttribute('aria-current', 'true')
    expect(dot('Lower body')).toHaveAttribute('aria-current', 'false')

    // Stopped between two panels, the nearer one is the one being snapped to.
    scrollTo(track, 460)
    expect(dot('Pull day')).toHaveAttribute('aria-current', 'true')
  })

  test('moves the row to the panel whose dot was tapped', async () => {
    render(<AppCarousel label="Your routines" slides={slides} />)
    const track = layOut(screen.getByRole('list', { name: 'Your routines' }), 300)

    await userEvent.click(dot('Pull day'))

    expect(track.scrollTo).toHaveBeenCalledWith({ left: 600, behavior: 'smooth' })
  })

  // One panel is not a carousel: a dot over it says "there is more" when there
  // is not.
  test('draws no dots for a single panel', () => {
    render(<AppCarousel label="Your routines" slides={slides.slice(0, 1)} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Your routines' })).toBeInTheDocument()
  })
})
