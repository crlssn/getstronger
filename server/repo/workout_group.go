package repo

import (
	"context"
	"fmt"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/gofrs/uuid/v5"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/safe"
	"github.com/crlssn/getstronger/server/training"
)

// setOccurrence names the block occurrence a set belongs to: which exercise of
// which block, keyed by the exercise and the set's position within it.
type setOccurrence struct {
	exerciseID uuid.UUID
	position   int
}

// writeWorkoutGroups stores the blocks a workout was trained in and returns, for
// each set, the occurrence that logged it. A workout saved without blocks writes
// none and every set is stored ungrouped.
func writeWorkoutGroups(
	ctx context.Context, exec bob.Executor, workoutID uuid.UUID, groups []training.WorkoutGroup,
) (map[setOccurrence]uuid.UUID, error) {
	occurrences := make(map[setOccurrence]uuid.UUID)

	for index, group := range groups {
		inserted, err := models.WorkoutGroups.Insert(&models.WorkoutGroupSetter{
			WorkoutID:                   omit.From(workoutID),
			Position:                    omit.From(safe.Int32FromInt(index)),
			Mode:                        omit.From(group.Mode),
			RestBetweenExercisesSeconds: omit.From(group.RestBetweenExercisesSeconds),
			RestBetweenRoundsSeconds:    omit.From(group.RestBetweenRoundsSeconds),
			Rounds:                      omit.From(group.Rounds),
		}).One(ctx, exec)
		if err != nil {
			return nil, fmt.Errorf("workout group insert: %w", err)
		}

		for position, exercise := range group.Exercises {
			occurrence, err := models.WorkoutGroupExercises.Insert(&models.WorkoutGroupExerciseSetter{
				WorkoutGroupID: omit.From(inserted.ID),
				ExerciseID:     omit.From(exercise.ExerciseID),
				Position:       omit.From(safe.Int32FromInt(position)),
			}).One(ctx, exec)
			if err != nil {
				return nil, fmt.Errorf("workout group exercise insert: %w", err)
			}

			for _, setPosition := range exercise.SetPositions {
				occurrences[setOccurrence{
					exerciseID: exercise.ExerciseID,
					position:   setPosition,
				}] = occurrence.ID
			}
		}
	}

	return occurrences, nil
}

// WorkoutGroupRecord is a stored block and the exercises it held, in training
// order. The sets belonging to it are read off the workout's own sets, each of
// which names the occurrence that logged it.
type WorkoutGroupRecord struct {
	Group     *models.WorkoutGroup
	Exercises models.WorkoutGroupExerciseSlice
}

// ListWorkoutGroups returns the blocks of each of these workouts, in training
// order, keyed by workout ID. Workouts logged before blocks were recorded have
// none, and are simply absent.
func (r *Repo) ListWorkoutGroups(ctx context.Context, workoutIDs ...uuid.UUID) (map[uuid.UUID][]WorkoutGroupRecord, error) {
	byWorkout := make(map[uuid.UUID][]WorkoutGroupRecord, len(workoutIDs))
	if len(workoutIDs) == 0 {
		return byWorkout, nil
	}

	ids := workoutIDs

	groups, err := models.WorkoutGroups.Query(
		models.SelectWhere.WorkoutGroups.WorkoutID.In(ids...),
		sm.OrderBy(models.WorkoutGroups.Columns.Position),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workout groups fetch: %w", err)
	}
	if len(groups) == 0 {
		return byWorkout, nil
	}

	groupIDs := make([]uuid.UUID, 0, len(groups))
	for _, group := range groups {
		groupIDs = append(groupIDs, group.ID)
	}

	exercises, err := models.WorkoutGroupExercises.Query(
		models.SelectWhere.WorkoutGroupExercises.WorkoutGroupID.In(groupIDs...),
		sm.OrderBy(models.WorkoutGroupExercises.Columns.Position),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workout group exercises fetch: %w", err)
	}

	byGroup := make(map[uuid.UUID]models.WorkoutGroupExerciseSlice, len(groups))
	for _, exercise := range exercises {
		byGroup[exercise.WorkoutGroupID] = append(byGroup[exercise.WorkoutGroupID], exercise)
	}

	for _, group := range groups {
		workoutID := group.WorkoutID
		byWorkout[workoutID] = append(byWorkout[workoutID], WorkoutGroupRecord{
			Group:     group,
			Exercises: byGroup[group.ID],
		})
	}

	return byWorkout, nil
}

// occurrenceOf is the block occurrence a set belongs to, or null where the
// workout was saved ungrouped.
func occurrenceOf(occurrences map[setOccurrence]uuid.UUID, set setOccurrence) omitnull.Val[uuid.UUID] {
	id, ok := occurrences[set]
	if !ok {
		var absent omitnull.Val[uuid.UUID]
		absent.Null()
		return absent
	}

	return omitnull.From(id)
}

// setOccurrencesOf reads the blocks a workout's stored sets belong to, so an
// edit that rewrites the rows can put each of them back where it was.
func setOccurrencesOf(sets models.SetSlice) map[setOccurrence]uuid.UUID {
	occurrences := make(map[setOccurrence]uuid.UUID, len(sets))
	for _, set := range sets {
		if set.WorkoutGroupExerciseID.IsNull() {
			continue
		}

		occurrences[setOccurrence{
			exerciseID: set.ExerciseID,
			position:   int(set.Position),
		}] = set.WorkoutGroupExerciseID.GetOrZero()
	}

	return occurrences
}
