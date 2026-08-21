// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/ui/plans/PlanForm', () => ({
  PlanForm: ({ planId }: { planId?: string }) => <p>editing {planId}</p>,
}))

import { renderWithProviders } from '@/ui/testing'
import { EditPlan } from './EditPlan'

describe('EditPlan', () => {
  // The route carries the plan; the builder itself only knows it is editing one.
  test('hands the builder the plan in the path', () => {
    renderWithProviders(
      <Routes>
        <Route path="/plans/:planId/edit" element={<EditPlan />} />
      </Routes>,
      { route: '/plans/plan-1/edit' },
    )

    expect(screen.getByText('editing plan-1')).toBeInTheDocument()
  })
})
