package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/factory"
)

// The plan the active persona follows: the first routines they built, in the
// order they built them, with the rotation already past its first routine so
// the dashboard shows a plan underway rather than one never started.
const (
	planName            = "Weekly Rotation"
	planRoutineCount    = 3
	planCurrentPosition = 1
)

var errPlanRoutinesMissing = errors.New("active persona has too few routines for a plan")

// seedActivePlan gives the active persona a plan to follow, so the dashboard's
// active plan and the plan page have something to show on beta.
func seedActivePlan(exec bob.Executor, f *factory.Factory, active *models.User) *models.Plan {
	routines, err := models.Routines.Query(
		models.SelectWhere.Routines.UserID.EQ(active.ID),
		sm.OrderBy(models.Routines.Columns.CreatedAt),
		sm.Limit(planRoutineCount),
	).All(context.Background(), exec)
	if err != nil {
		panic(fmt.Errorf("retrieve routines for the active persona's plan: %w", err))
	}
	if len(routines) < planRoutineCount {
		panic(fmt.Errorf("%w: got %d, want %d", errPlanRoutinesMissing, len(routines), planRoutineCount))
	}

	plan := f.NewPlan(
		factory.PlanUserID(active.ID),
		factory.PlanName(planName),
		factory.PlanActive(),
		factory.PlanCurrentPosition(planCurrentPosition),
	)
	f.AddPlanRoutine(plan, routines...)

	return plan
}
