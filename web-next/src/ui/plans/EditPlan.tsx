import { useParams } from 'react-router-dom'

import { PlanForm } from '@/ui/plans/PlanForm'

/** The edit route's entry point: the same builder, aimed at an existing plan. */
export const EditPlan = () => {
  const { planId = '' } = useParams()

  return <PlanForm planId={planId} />
}
