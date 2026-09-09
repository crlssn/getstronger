package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/safe"
)

type PlanOpt func(plan *models.PlanSetter)

func PlanUserID(userID any) PlanOpt {
	return func(plan *models.PlanSetter) {
		plan.UserID = omit.From(nativeUUID(userID))
	}
}

func PlanName(name string) PlanOpt {
	return func(plan *models.PlanSetter) {
		plan.Name = omit.From(name)
	}
}

// PlanActive makes this the plan the athlete is following. An athlete has at
// most one, which the database enforces.
func PlanActive() PlanOpt {
	return func(plan *models.PlanSetter) {
		plan.Active = omit.From(true)
	}
}

// PlanCurrentPosition is how far into its rotation the plan has reached, as an
// index into the routines added to it.
func PlanCurrentPosition(position int) PlanOpt {
	return func(plan *models.PlanSetter) {
		plan.CurrentPosition = omit.From(safe.Int32FromInt(position))
	}
}

func PlanCreatedAt(createdAt time.Time) PlanOpt {
	return func(plan *models.PlanSetter) {
		plan.CreatedAt = omit.From(createdAt)
		plan.UpdatedAt = omit.From(createdAt)
	}
}

// NewPlan creates a plan holding no routines; AddPlanRoutine gives it its
// rotation.
func (f *Factory) NewPlan(opts ...PlanOpt) *models.Plan {
	setter := &models.PlanSetter{
		ID:   omit.From(newUUID()),
		Name: omit.From(f.Faker.RandomString([]string{"Push Pull Legs", "Upper Lower", "Strength Block", "Base Building"})),
	}
	for _, opt := range opts {
		opt(setter)
	}
	if setter.UserID.IsUnset() {
		setter.UserID = omit.From(f.NewUser().ID)
	}

	plan, err := models.Plans.Insert(setter).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("create plan: %w", err))
	}

	return plan
}

// AddPlanRoutine appends the routines to the plan's rotation, continuing from
// the position it already reaches.
func (f *Factory) AddPlanRoutine(plan *models.Plan, routines ...*models.Routine) {
	ctx := context.Background()
	position := f.nextPlanRoutinePosition(plan)

	for _, routine := range routines {
		if _, err := models.PlanRoutines.Insert(&models.PlanRoutineSetter{
			PlanID:    omit.From(plan.ID),
			RoutineID: omit.From(routine.ID),
			Position:  omit.From(position),
		}).One(ctx, f.exec); err != nil {
			panic(fmt.Errorf("create plan routine: %w", err))
		}
		position++
	}
}

func (f *Factory) nextPlanRoutinePosition(plan *models.Plan) int32 {
	count, err := models.PlanRoutines.Query(
		models.SelectWhere.PlanRoutines.PlanID.EQ(plan.ID),
	).Count(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("count plan routines: %w", err))
	}

	return safe.Int32FromInt64(count)
}
