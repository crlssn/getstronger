package factory

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

type WorkoutGroupOpt func(group *models.WorkoutGroupSetter)

// WorkoutGroupCircuit records the block as a circuit and the rests it was
// worked with.
func WorkoutGroupCircuit(restBetweenExercisesSeconds, restBetweenRoundsSeconds int32) WorkoutGroupOpt {
	return func(group *models.WorkoutGroupSetter) {
		group.Mode = omit.From(enums.RoutineGroupModeCircuit)
		group.RestBetweenExercisesSeconds = omit.From(restBetweenExercisesSeconds)
		group.RestBetweenRoundsSeconds = omit.From(restBetweenRoundsSeconds)
	}
}

// WorkoutGroupRounds is how many times the circuit was worked through.
func WorkoutGroupRounds(rounds int32) WorkoutGroupOpt {
	return func(group *models.WorkoutGroupSetter) {
		group.Rounds = omit.From(rounds)
	}
}

// NewWorkoutGroup appends a block to the workout, after the blocks it already
// holds. The exercises trained in it are added with AddWorkoutGroupExercise.
func (f *Factory) NewWorkoutGroup(workout *models.Workout, opts ...WorkoutGroupOpt) *models.WorkoutGroup {
	setter := &models.WorkoutGroupSetter{
		WorkoutID: omit.From(workout.ID),
		Position:  omit.From(f.nextWorkoutGroupPosition(workout)),
		Mode:      omit.From(enums.RoutineGroupModeStraight),
	}
	for _, opt := range opts {
		opt(setter)
	}

	group, err := models.WorkoutGroups.Insert(setter).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("create workout group: %w", err))
	}

	return group
}

// AddWorkoutGroupExercise appends the exercises to the block, each an
// occurrence a set names to say the block logged it.
func (f *Factory) AddWorkoutGroupExercise(
	group *models.WorkoutGroup, exercises ...*models.Exercise,
) models.WorkoutGroupExerciseSlice {
	ctx := context.Background()
	position := f.nextWorkoutGroupExercisePosition(group)

	occurrences := make(models.WorkoutGroupExerciseSlice, 0, len(exercises))
	for _, exercise := range exercises {
		occurrence, err := models.WorkoutGroupExercises.Insert(&models.WorkoutGroupExerciseSetter{
			WorkoutGroupID: omit.From(group.ID),
			ExerciseID:     omit.From(exercise.ID),
			Position:       omit.From(position),
		}).One(ctx, f.exec)
		if err != nil {
			panic(fmt.Errorf("create workout group exercise: %w", err))
		}
		occurrences = append(occurrences, occurrence)
		position++
	}

	return occurrences
}

func (f *Factory) nextWorkoutGroupPosition(workout *models.Workout) int32 {
	group, err := models.WorkoutGroups.Query(
		models.SelectWhere.WorkoutGroups.WorkoutID.EQ(workout.ID),
		sm.OrderBy(models.WorkoutGroups.Columns.Position).Desc(),
		sm.Limit(1),
	).One(context.Background(), f.exec)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0
		}
		panic(fmt.Errorf("retrieve last workout group: %w", err))
	}

	return group.Position + 1
}

func (f *Factory) nextWorkoutGroupExercisePosition(group *models.WorkoutGroup) int32 {
	occurrence, err := models.WorkoutGroupExercises.Query(
		models.SelectWhere.WorkoutGroupExercises.WorkoutGroupID.EQ(group.ID),
		sm.OrderBy(models.WorkoutGroupExercises.Columns.Position).Desc(),
		sm.Limit(1),
	).One(context.Background(), f.exec)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0
		}
		panic(fmt.Errorf("retrieve last workout group exercise: %w", err))
	}

	return occurrence.Position + 1
}
