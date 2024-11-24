package testdb

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

type WorkoutOpt func(workout *orm.Workout)

func (f *Factory) NewWorkout(opts ...WorkoutOpt) *orm.Workout {
	workout := &orm.Workout{
		ID:         uuid.NewString(),
		Name:       f.faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"}),
		UserID:     f.NewUser().ID,
		FinishedAt: time.Time{},
		CreatedAt:  time.Time{},
	}

	for _, opt := range opts {
		opt(workout)
	}

	if err := workout.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert workout: %w", err))
	}

	return workout
}

func WorkoutID(workoutID string) WorkoutOpt {
	return func(workout *orm.Workout) {
		workout.ID = workoutID
	}
}
