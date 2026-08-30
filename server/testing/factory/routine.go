package factory

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob/dialect/psql/im"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

func (f *Factory) NewRoutineSlice(count int, opts ...RoutineOpt) models.RoutineSlice {
	slice := make(models.RoutineSlice, 0, count)
	for range count {
		slice = append(slice, f.NewRoutine(opts...))
	}

	return slice
}

type RoutineOpt func(routine *models.RoutineSetter)

func (f *Factory) NewRoutine(opts ...RoutineOpt) *models.Routine {
	setter := &models.RoutineSetter{
		ID:    omit.From(newUUID()),
		Title: omit.From(f.Faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"})),
	}
	for _, opt := range opts {
		opt(setter)
	}

	ctx := context.Background()
	var user *models.User
	if userID, ok := setter.UserID.Get(); ok {
		user = f.mustUser(userID)
	} else {
		user = f.NewUser()
	}

	mods := []bobfactory.RoutineMod{bobfactory.RoutineMods.WithExistingUser(userWithoutRelationships(user))}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.ID(value))
	}
	if value, ok := setter.Title.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.Title(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.CreatedAt(value))
	}
	if value, ok := setter.DeletedAt.GetNull(); ok {
		mods = append(mods, bobfactory.RoutineMods.DeletedAt(value))
	}
	template := f.generated.NewRoutine(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.UserID = omit.From(built.UserID)
	routine, err := models.Routines.Insert(
		setter,
		im.OnConflict(models.Routines.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("create routine with Bob factory: %w", err))
	}
	routine.R = built.R

	return routine
}

func RoutineID(id any) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.ID = omit.From(nativeUUID(id))
	}
}

func RoutineUserID(userID any) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.UserID = omit.From(nativeUUID(userID))
	}
}

func RoutineCreatedAt(createdAt time.Time) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.CreatedAt = omit.From(createdAt)
	}
}

func RoutineName(name string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.Title = omit.From(name)
	}
}

// AddRoutineExercise appends the exercises to the routine, continuing from the
// routine's current last position so repeated calls keep extending the order.
// They join the routine's last group, the way the app appends them.
func (f *Factory) AddRoutineExercise(routine *models.Routine, exercises ...*models.Exercise) {
	ctx := context.Background()

	lastLink, err := models.ExercisesRoutines.Query(
		models.SelectWhere.ExercisesRoutines.RoutineID.EQ(routine.ID),
		sm.OrderBy(models.ExercisesRoutines.Columns.Position).Desc(),
		sm.Limit(1),
	).One(ctx, f.exec)
	var position int32
	if err == nil {
		position = lastLink.Position
	} else if !errors.Is(err, sql.ErrNoRows) {
		panic(fmt.Errorf("retrieve last routine exercise position: %w", err))
	}

	group := f.lastRoutineGroup(routine)
	for _, exercise := range exercises {
		position++
		f.generated.NewExercisesRoutine(
			bobfactory.ExercisesRoutineMods.WithExistingRoutine(routineWithoutRelationships(routine)),
			bobfactory.ExercisesRoutineMods.WithExistingExercise(exerciseWithoutRelationships(exercise)),
			bobfactory.ExercisesRoutineMods.WithExistingGroupRoutineGroup(routineGroupWithoutRelationships(group)),
			bobfactory.ExercisesRoutineMods.Position(position),
		).MustCreate(ctx, f.exec)
	}
}

type RoutineGroupOpt func(group *models.RoutineGroupSetter)

func RoutineGroupCircuit(restBetweenExercisesSeconds, restBetweenRoundsSeconds int32) RoutineGroupOpt {
	return func(group *models.RoutineGroupSetter) {
		group.Mode = omit.From(enums.RoutineGroupModeCircuit)
		group.RestBetweenExercisesSeconds = omit.From(restBetweenExercisesSeconds)
		group.RestBetweenRoundsSeconds = omit.From(restBetweenRoundsSeconds)
	}
}

// NewRoutineGroup appends a group to the routine. Exercises added afterwards
// join it, since it is then the routine's last group.
func (f *Factory) NewRoutineGroup(routine *models.Routine, opts ...RoutineGroupOpt) *models.RoutineGroup {
	ctx := context.Background()

	setter := &models.RoutineGroupSetter{
		RoutineID: omit.From(routine.ID),
		Position:  omit.From(f.nextRoutineGroupPosition(routine)),
		Mode:      omit.From(enums.RoutineGroupModeStraight),
	}
	for _, opt := range opts {
		opt(setter)
	}

	group, err := models.RoutineGroups.Insert(setter).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("create routine group: %w", err))
	}

	return group
}

func (f *Factory) nextRoutineGroupPosition(routine *models.Routine) int32 {
	last, err := f.queryLastRoutineGroup(routine)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0
		}
		panic(fmt.Errorf("retrieve last routine group: %w", err))
	}

	return last.Position + 1
}

// lastRoutineGroup is where an appended exercise belongs. A routine always has
// at least one group, so an empty one gets its straight-sets group here.
func (f *Factory) lastRoutineGroup(routine *models.Routine) *models.RoutineGroup {
	last, err := f.queryLastRoutineGroup(routine)
	if err == nil {
		return last
	}
	if !errors.Is(err, sql.ErrNoRows) {
		panic(fmt.Errorf("retrieve last routine group: %w", err))
	}

	return f.NewRoutineGroup(routine)
}

func (f *Factory) queryLastRoutineGroup(routine *models.Routine) (*models.RoutineGroup, error) {
	group, err := models.RoutineGroups.Query(
		models.SelectWhere.RoutineGroups.RoutineID.EQ(routine.ID),
		sm.OrderBy(models.RoutineGroups.Columns.Position).Desc(),
		sm.Limit(1),
	).One(context.Background(), f.exec)
	if err != nil {
		return nil, fmt.Errorf("routine group query: %w", err)
	}

	return group, nil
}
