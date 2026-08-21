// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { create, destroy } = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }))

// SortableJS needs real drag events; what this hook owns is the wiring, so the
// library is stood in for and its callback invoked directly.
vi.mock('sortablejs', () => ({ default: { create } }))

import { useSortable } from './useSortable'

const List = ({ onReorder, enabled = true }: { onReorder: () => void; enabled?: boolean }) => {
  const list = useSortable<HTMLUListElement>({ onReorder }, enabled)

  return (
    <ul ref={list} data-testid="list">
      <li>one</li>
    </ul>
  )
}

const reorder = (from: number, to: number) => {
  const options = create.mock.calls.at(-1)?.[1] as {
    onUpdate: (event: { oldIndex?: number; newIndex?: number }) => void
  }
  options.onUpdate({ oldIndex: from, newIndex: to })
}

describe('useSortable', () => {
  beforeEach(() => {
    create.mockReset()
    destroy.mockReset()
    create.mockReturnValue({ destroy })
  })

  test('makes the element it is given draggable', () => {
    render(<List onReorder={vi.fn()} />)

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toBe(screen.getByTestId('list'))
  })

  test('reports where an item was dropped', () => {
    const onReorder = vi.fn()
    render(<List onReorder={onReorder} />)

    reorder(2, 0)

    expect(onReorder).toHaveBeenCalledWith(2, 0)
  })

  // A caller usually passes an inline function; depending on it would tear the
  // list down and rebuild it on every render.
  test('follows the latest callback without rebuilding', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<List onReorder={first} />)

    rerender(<List onReorder={second} />)
    reorder(1, 0)

    expect(create).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(1, 0)
  })

  test('does nothing while disabled', () => {
    render(<List onReorder={vi.fn()} enabled={false} />)

    expect(create).not.toHaveBeenCalled()
  })

  test('lets go of the element when it unmounts', () => {
    const { unmount } = render(<List onReorder={vi.fn()} />)

    unmount()

    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
