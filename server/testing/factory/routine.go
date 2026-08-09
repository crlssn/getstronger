package factory

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aarondl/opt/omit"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"
	bobtypes "github.com/stephenafamo/bob/types"

	"github.com/crlssn/getstronger/server/gen/models"
)

func (f *Factory) NewRoutineSlice(count int, opts ...RoutineOpt) models.RoutineSlice {
	slice := make(models.RoutineSlice, 0, count)
	for range count {
		slice = append(slice, f.NewRoutine(opts...))
	}

	return slice
}

type RoutineOpt func(event *models.RoutineSetter)

func (f *Factory) NewRoutine(opts ...RoutineOpt) *models.Routine {
	m := &models.RoutineSetter{
		ID:    omit.From(uuid.NewString()),
		Title: omit.From(f.Faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"})),
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID.IsUnset() {
		m.UserID = omit.From(f.NewUser().ID)
	}

	ctx := context.Background()
	routine, err := models.Routines.Insert(m,
		im.OnConflict(models.Routines.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert routine: %w", err))
	}

	user, err := models.Users.Query(
		models.SelectWhere.Users.ID.EQ(routine.UserID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}
	routine.R.User = user
	routine.R.Loaded.User = true

	return routine
}

func RoutineID(id string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.ID = omit.From(id)
	}
}

func RoutineUserID(userID string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.UserID = omit.From(userID)
	}
}

func RoutineName(name string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.Title = omit.From(name)
	}
}

func RoutineExerciseOrder(exerciseIDs []string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		bytes, err := json.Marshal(exerciseIDs)
		if err != nil {
			panic(fmt.Errorf("failed to marshal exercise order: %w", err))
		}
		m.ExerciseOrder = omit.From(bobtypes.NewJSON[json.RawMessage](bytes))
	}
}

func (f *Factory) AddRoutineExercise(routine *models.Routine, exercises ...*models.Exercise) {
	if len(exercises) == 0 {
		return
	}

	links := make([]*models.ExerciseRoutineSetter, 0, len(exercises))
	for _, exercise := range exercises {
		links = append(links, &models.ExerciseRoutineSetter{
			RoutineID:  omit.From(routine.ID),
			ExerciseID: omit.From(exercise.ID),
		})
	}

	if _, err := models.ExerciseRoutines.Insert(bob.ToMods(links...)).
		Exec(context.Background(), bob.NewDB(f.db)); err != nil {
		panic(fmt.Errorf("failed to add exercises to routine: %w", err))
	}
}
