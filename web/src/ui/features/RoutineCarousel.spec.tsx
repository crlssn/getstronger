// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { PlanSchema, RoutineSchema } from '@/proto/api/v1/routine_service_pb'
import { renderWithProviders } from '@/ui/testing'
import { RoutineCarousel } from './RoutineCarousel'

const routine = (fields: MessageInitShape<typeof RoutineSchema>) => create(RoutineSchema, fields)

const routines = [
  routine({ id: 'r1', name: 'Lower body', exercises: [{ id: 'e1' }, { id: 'e2' }] }),
  routine({ id: 'r2', name: 'Push day', exercises: [{ id: 'e3' }] }),
  routine({ id: 'r3', name: 'Pull day', exercises: [{ id: 'e4' }] }),
]

const render = (props: Partial<Parameters<typeof RoutineCarousel>[0]> = {}) =>
  renderWithProviders(
    <RoutineCarousel
      nextRoutine={routines[0]}
      routines={routines}
      onShowAll={vi.fn()}
      onSwitch={vi.fn()}
      {...props}
    />,
  )

describe('RoutineCarousel', () => {
  test('leads with what is up next and offers the rest behind it', () => {
    render()

    const panels = screen.getAllByRole('listitem')
    expect(panels).toHaveLength(3)
    expect(panels[0]).toHaveTextContent('Up next')
    expect(panels[0]).toHaveTextContent('Lower body')
    expect(panels[0]).toHaveTextContent('2 exercises')
    expect(panels[1]).toHaveTextContent('Or switch to')
    expect(panels[1]).toHaveTextContent('Push day')
  })

  // Eight minutes an exercise, never under half an hour.
  test('says how long each session is likely to take', () => {
    render()

    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('About 30 min')
  })

  test('starts the routine the panel is about', () => {
    render()

    expect(screen.getByRole('link', { name: 'Start Lower body' })).toHaveAttribute(
      'href',
      '/workouts/routine/r1',
    )
    expect(screen.getByRole('link', { name: 'Start Push day' })).toHaveAttribute(
      'href',
      '/workouts/routine/r2',
    )
  })

  // Starting an alternative is the switch: what is up next tomorrow is what
  // was chosen today.
  test('reports the routine swiped to and started', async () => {
    const onSwitch = vi.fn()
    render({ onSwitch })

    await userEvent.click(screen.getByRole('link', { name: 'Start Pull day' }))

    expect(onSwitch).toHaveBeenCalledWith('r3')
  })

  test('does not report a switch to what is already up next', async () => {
    const onSwitch = vi.fn()
    render({ onSwitch })

    await userEvent.click(screen.getByRole('link', { name: 'Start Lower body' }))

    expect(onSwitch).not.toHaveBeenCalled()
  })

  // A plan decides the order, so a swipe that changed it would be arguing
  // with the plan.
  test('offers nothing to switch to under a plan', () => {
    render({
      activePlan: create(PlanSchema, {
        id: 'plan-1',
        name: 'Push pull legs',
        currentPosition: 1,
        routines: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
      }),
    })

    const panels = screen.getAllByRole('listitem')
    expect(panels).toHaveLength(1)
    expect(panels[0]).toHaveTextContent('Push pull legs')
    // Position is one-based on screen, zero-based in the message.
    expect(panels[0]).toHaveTextContent('2 of 3')
    expect(screen.getByRole('link', { name: 'Start Lower body' })).toHaveAttribute(
      'href',
      '/workouts/routine/r1?plan_id=plan-1',
    )
  })

  // Swiping through twenty routines is not choosing between them, so past a
  // handful the picker takes over.
  test('hands a long list of routines to the picker instead', async () => {
    const onShowAll = vi.fn()
    const many = Array.from({ length: 9 }, (_, index) =>
      routine({ id: `r${index}`, name: `Routine ${index}`, exercises: [{ id: 'e1' }] }),
    )
    render({ nextRoutine: many[0], routines: many, onShowAll })

    expect(screen.getAllByRole('listitem')).toHaveLength(5)

    await userEvent.click(screen.getByRole('button', { name: 'Choose another routine' }))

    expect(onShowAll).toHaveBeenCalled()
  })

  test('keeps the picker out of the way while the row holds everything', () => {
    render()

    expect(screen.queryByRole('button', { name: 'Choose another routine' })).not.toBeInTheDocument()
  })
})
