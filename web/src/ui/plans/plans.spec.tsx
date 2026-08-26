// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getPlan: vi.fn(),
  listRoutines: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  GetPlanResponseSchema,
  ListRoutinesResponseSchema,
  PlanSchema,
} from '@/proto/api/v1/routine_service_pb'
import { useToastStore } from '@/stores/toasts'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'
import { lowerKeyboard, raiseKeyboard, renderWithProviders } from '@/ui/testing'
import { PlanForm } from './PlanForm'
import { PlansView } from './PlansView'
import { ViewPlan } from './ViewPlan'

const mocked = {
  getPlan: vi.mocked(requests.getPlan),
  listRoutines: vi.mocked(requests.listRoutines),
}

const routines = [
  { id: 'push', name: 'Push day', exercises: [{ id: 'bench' }, { id: 'dips' }] },
  { id: 'pull', name: 'Pull day', exercises: [{ id: 'row' }] },
  { id: 'legs', name: 'Leg day', exercises: [{ id: 'squat' }] },
]

const plan = (fields: MessageInitShape<typeof PlanSchema> = {}) =>
  create(PlanSchema, {
    id: 'plan-1',
    name: 'Push pull legs',
    routines: routines.slice(0, 2),
    currentPosition: 0,
    ...fields,
  })

const accept = async () => {
  await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
  useConfirmationStore.getState().accept()
}

beforeEach(() => {
  lowerKeyboard()
  Object.values(mocked).forEach((mock) => mock.mockReset())
  mocked.listRoutines.mockResolvedValue(create(ListRoutinesResponseSchema, { routines }))
  mocked.getPlan.mockResolvedValue(create(GetPlanResponseSchema, { plan: plan() }))
  vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
  usePlanStore.setState({ plans: [], loading: false, failed: false })
  useToastStore.getState().dismiss()
  useConfirmationStore.setState({ confirmation: null, resolver: null })
})

describe('PlansView', () => {
  const render = () => renderWithProviders(<PlansView />, { route: '/plans' })

  const withPlans = (loaded: ReturnType<typeof plan>[]) =>
    vi.spyOn(usePlanStore.getState(), 'load').mockImplementation(async () => {
      usePlanStore.setState({ plans: loaded })
    })

  // A plan is an unfamiliar idea, so the empty state teaches it rather than
  // just offering a button.
  test('explains what a plan is when there are none', async () => {
    withPlans([])
    render()

    expect(await screen.findByText('How plans work')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Create your first plan/ })).toHaveAttribute(
      'href',
      '/plans/create',
    )
    // The header's create link would be a second way to do the same thing.
    expect(screen.queryByRole('link', { name: /New plan/ })).not.toBeInTheDocument()
  })

  // The empty state teaches what a plan is, which is the wrong lesson for
  // someone who already has three of them.
  test('says the fetch failed rather than explaining what a plan is', async () => {
    vi.spyOn(usePlanStore.getState(), 'load').mockImplementation(async () => {
      usePlanStore.setState({ failed: true })
    })
    render()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('How plans work')).not.toBeInTheDocument()
  })

  test('leads with the running plan and where it is in the loop', async () => {
    withPlans([plan({ active: true, currentPosition: 1 })])
    render()

    await screen.findByText('Push pull legs')
    expect(screen.getByText('Routine 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('Pull day')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View plan' })).toHaveAttribute('href', '/plans/plan-1')
  })

  test('says so when no plan is running', async () => {
    withPlans([plan()])
    render()

    expect(await screen.findByText('No active plan')).toBeInTheDocument()
  })

  test('pauses the running plan, once confirmed', async () => {
    const pause = vi.spyOn(usePlanStore.getState(), 'pause').mockResolvedValue(true)
    withPlans([plan({ active: true })])
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await accept()

    await waitFor(() => expect(pause).toHaveBeenCalled())
  })

  // Only one plan runs at a time, so activating another one ends the first.
  test('asks before swapping the running plan for another', async () => {
    const activate = vi.spyOn(usePlanStore.getState(), 'activate').mockResolvedValue(undefined)
    withPlans([plan({ active: true }), plan({ id: 'plan-2', name: 'Full body' })])
    render()

    const other = (await screen.findByText('Full body')).closest('article')!
    await userEvent.click(within(other).getByRole('button', { name: 'Make active' }))
    await accept()

    await waitFor(() => expect(activate).toHaveBeenCalledWith('plan-2'))
  })

  test('activates straight away when nothing is running', async () => {
    const activate = vi.spyOn(usePlanStore.getState(), 'activate').mockResolvedValue(undefined)
    withPlans([plan()])
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Make active' }))

    await waitFor(() => expect(activate).toHaveBeenCalledWith('plan-1'))
    expect(useConfirmationStore.getState().confirmation).toBeNull()
  })
})

describe('ViewPlan', () => {
  const render = () =>
    renderWithProviders(
      <Routes>
        <Route path="/plans" element={<p>plans</p>} />
        <Route path="/plans/:id" element={<ViewPlan />} />
      </Routes>,
      { route: '/plans/plan-1' },
    )

  test('lists the loop in order', async () => {
    render()

    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Push day')
    expect(rows[1]).toHaveTextContent('Pull day')
  })

  // The loop is the point of a plan, so the wrap-around is spelled out.
  test('says what follows the last routine', async () => {
    render()

    expect(await screen.findByText(/After Pull day.*Push day/)).toBeInTheDocument()
  })

  test('marks where an active plan currently is', async () => {
    mocked.getPlan.mockResolvedValue(
      create(GetPlanResponseSchema, { plan: plan({ active: true, currentPosition: 1 }) }),
    )
    render()

    const rows = await screen.findAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('UP NEXT')
    expect(rows[0]).not.toHaveTextContent('UP NEXT')
  })

  test('offers to activate a paused plan and to pause a running one', async () => {
    render()

    expect(await screen.findByRole('button', { name: 'Make active' })).toBeInTheDocument()

    mocked.getPlan.mockResolvedValue(
      create(GetPlanResponseSchema, { plan: plan({ active: true }) }),
    )
    renderWithProviders(<ViewPlan />, { route: '/plans/plan-1' })
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  test('deletes the plan and returns to the list, once confirmed', async () => {
    const remove = vi.spyOn(usePlanStore.getState(), 'remove').mockResolvedValue(true)
    render()

    await userEvent.click(await screen.findByRole('button', { name: /Delete plan/ }))
    await accept()

    await waitFor(() => expect(remove).toHaveBeenCalledWith('plan-1'))
    expect(await screen.findByText('plans')).toBeInTheDocument()
  })

  test('goes back to the list when the plan is gone', async () => {
    mocked.getPlan.mockResolvedValue(undefined)
    render()

    expect(await screen.findByText('plans')).toBeInTheDocument()
  })
})

describe('PlanForm', () => {
  const render = (planId?: string) =>
    renderWithProviders(<PlanForm planId={planId} />, { route: '/plans/create' })

  const addRoutine = async (name: string | RegExp) => {
    await userEvent.click(await screen.findByRole('button', { name: /Add routine/ }))
    await userEvent.click(await screen.findByRole('button', { name }))
  }

  test('will not save until it has a name and a routine', async () => {
    render()

    const save = await screen.findByRole('button', { name: 'Create plan' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox'), 'Upper lower')
    expect(save).toBeDisabled()

    await addRoutine(/Push day/)
    expect(save).toBeEnabled()
  })

  // Parked at the end of the scroll the save was sliced in half by the tab
  // bar. The pinned footer is the only thing in the app that stands down for
  // the keyboard, so its absence while one is up says the save is in one.
  test('pins its save above the tab bar', async () => {
    raiseKeyboard()
    render()

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Create plan' })).not.toBeInTheDocument(),
    )
  })

  test('creates the plan with its routines in order', async () => {
    const createPlan = vi.spyOn(usePlanStore.getState(), 'create').mockResolvedValue(plan())
    render()

    await userEvent.type(await screen.findByRole('textbox'), '  Upper lower  ')
    await addRoutine(/Push day/)
    await addRoutine(/Pull day/)
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }))

    // Trimmed, so a stray space does not become part of the name.
    await waitFor(() => expect(createPlan).toHaveBeenCalledWith('Upper lower', ['push', 'pull']))
    expect(useToastStore.getState().toast?.type).toBe('success')
  })

  // A routine appears once in a plan, so the picker stops offering it.
  test('stops offering a routine already in the plan', async () => {
    render()

    await addRoutine(/Push day/)
    await userEvent.click(await screen.findByRole('button', { name: /Add routine/ }))

    // Scoped to the picker: the chosen routine's own row carries move and
    // remove buttons that also mention it.
    const picker = within(await screen.findByRole('dialog'))
    expect(picker.getByRole('button', { name: /Pull day/ })).toBeInTheDocument()
    expect(picker.queryByRole('button', { name: /Push day/ })).not.toBeInTheDocument()
  })

  test('reorders and removes routines', async () => {
    const createPlan = vi.spyOn(usePlanStore.getState(), 'create').mockResolvedValue(plan())
    render()

    await userEvent.type(await screen.findByRole('textbox'), 'Upper lower')
    await addRoutine(/Push day/)
    await addRoutine(/Pull day/)
    await addRoutine(/Leg day/)

    await userEvent.click(screen.getByRole('button', { name: 'Move Leg day up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Push day' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }))

    await waitFor(() => expect(createPlan).toHaveBeenCalledWith('Upper lower', ['legs', 'pull']))
  })

  test('cannot move the first routine up or the last one down', async () => {
    render()

    await addRoutine(/Push day/)
    await addRoutine(/Pull day/)

    expect(screen.getByRole('button', { name: 'Move Push day up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Pull day down' })).toBeDisabled()
  })

  describe('editing', () => {
    test('opens with the plan already filled in', async () => {
      render('plan-1')

      expect(await screen.findByDisplayValue('Push pull legs')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })

    test('saves the changes', async () => {
      const update = vi.spyOn(usePlanStore.getState(), 'update').mockResolvedValue(plan())
      render('plan-1')

      await userEvent.click(await screen.findByRole('button', { name: 'Remove Push day' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(update).toHaveBeenCalledWith('plan-1', 'Push pull legs', ['pull']))
    })
  })
})
