package repo

import (
	"context"
	"fmt"
	"maps"

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

// ListWorkoutGroups returns the blocks of each of these workouts, in training
// order, keyed by workout ID. Workouts logged before blocks were recorded have
// none, and are simply absent.
func (r *Repo) ListWorkoutGroups(ctx context.Context, workoutIDs ...uuid.UUID) (map[uuid.UUID][]training.WorkoutGroupRecord, error) {
	byWorkout := make(map[uuid.UUID][]training.WorkoutGroupRecord, len(workoutIDs))
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

	byGroup := make(map[uuid.UUID][]training.WorkoutGroupOccurrence, len(groups))
	for _, exercise := range exercises {
		byGroup[exercise.WorkoutGroupID] = append(byGroup[exercise.WorkoutGroupID], training.WorkoutGroupOccurrence{
			ID:         exercise.ID,
			ExerciseID: exercise.ExerciseID,
		})
	}

	for _, group := range groups {
		workoutID := group.WorkoutID
		byWorkout[workoutID] = append(byWorkout[workoutID], training.WorkoutGroupRecord{
			ID:                          group.ID,
			Mode:                        group.Mode,
			RestBetweenExercisesSeconds: group.RestBetweenExercisesSeconds,
			RestBetweenRoundsSeconds:    group.RestBetweenRoundsSeconds,
			Rounds:                      group.Rounds,
			Exercises:                   byGroup[group.ID],
		})
	}

	return byWorkout, nil
}

// occurrenceOf is the block occurrence a set belongs to: the one that logged it,
// or — for a set an edit added past every position the session recorded — the
// block that exercise was last trained in. A set of an exercise no block holds
// belongs to none, and is null.
func occurrenceOf(occurrences map[setOccurrence]uuid.UUID, set setOccurrence) omitnull.Val[uuid.UUID] {
	id, ok := occurrences[set]
	if !ok {
		id, ok = occurrenceBefore(occurrences, set)
	}

	if !ok {
		var absent omitnull.Val[uuid.UUID]
		absent.Null()
		return absent
	}

	return omitnull.From(id)
}

// occurrenceBefore is the block the exercise was last trained in ahead of this
// position, which is the block a set appended to it extends.
func occurrenceBefore(occurrences map[setOccurrence]uuid.UUID, set setOccurrence) (uuid.UUID, bool) {
	var id uuid.UUID
	last := -1

	for candidate, occurrence := range occurrences {
		if candidate.exerciseID != set.exerciseID {
			continue
		}
		if candidate.position >= set.position || candidate.position <= last {
			continue
		}

		last = candidate.position
		id = occurrence
	}

	return id, last >= 0
}

// exerciseSetsOutsideBlocks is the sets of the exercises no block of the workout
// holds — what an edit introduced rather than what the session trained.
func exerciseSetsOutsideBlocks(occurrences map[setOccurrence]uuid.UUID, exerciseSets []ExerciseSet) []ExerciseSet {
	trained := make(map[uuid.UUID]struct{}, len(occurrences))
	for occurrence := range occurrences {
		trained[occurrence.exerciseID] = struct{}{}
	}

	introduced := make([]ExerciseSet, 0, len(exerciseSets))
	for _, exerciseSet := range exerciseSets {
		if _, ok := trained[exerciseSet.ExerciseID]; ok {
			continue
		}
		if len(exerciseSet.Sets) == 0 {
			continue
		}

		introduced = append(introduced, exerciseSet)
	}

	return introduced
}

// addIntroducedExercisesToBlocks gives the exercises an edit introduced a
// trailing block, and records in occurrences where their sets now belong. A
// workout logged without blocks is left without any: it reads as the flat list
// it always did.
func addIntroducedExercisesToBlocks(
	ctx context.Context, tx *Repo, workoutID uuid.UUID,
	exerciseSets []ExerciseSet, occurrences map[setOccurrence]uuid.UUID,
) error {
	introduced := exerciseSetsOutsideBlocks(occurrences, exerciseSets)
	if len(introduced) == 0 {
		return nil
	}

	groups, err := tx.ListWorkoutGroups(ctx, workoutID)
	if err != nil {
		return err
	}

	blocks := groups[workoutID]
	if len(blocks) == 0 {
		return nil
	}

	appended, err := appendWorkoutGroup(ctx, tx.bobExec(), workoutID, len(blocks), introduced)
	if err != nil {
		return err
	}

	maps.Copy(occurrences, appended)

	return nil
}

// appendWorkoutGroup stores a trailing straight block holding the exercises an
// edit introduced, and returns the occurrence each of their sets was given. A
// workout that has blocks is read as its blocks, so an exercise none of them
// holds is work the athlete is never shown again.
func appendWorkoutGroup(
	ctx context.Context, exec bob.Executor, workoutID uuid.UUID, position int, exerciseSets []ExerciseSet,
) (map[setOccurrence]uuid.UUID, error) {
	group, err := models.WorkoutGroups.Insert(&models.WorkoutGroupSetter{
		WorkoutID: omit.From(workoutID),
		Position:  omit.From(safe.Int32FromInt(position)),
		Mode:      omit.From(training.RoutineGroupModeStraight),
	}).One(ctx, exec)
	if err != nil {
		return nil, fmt.Errorf("workout group insert: %w", err)
	}

	occurrences := make(map[setOccurrence]uuid.UUID)
	for index, exerciseSet := range exerciseSets {
		occurrence, err := models.WorkoutGroupExercises.Insert(&models.WorkoutGroupExerciseSetter{
			WorkoutGroupID: omit.From(group.ID),
			ExerciseID:     omit.From(exerciseSet.ExerciseID),
			Position:       omit.From(safe.Int32FromInt(index)),
		}).One(ctx, exec)
		if err != nil {
			return nil, fmt.Errorf("workout group exercise insert: %w", err)
		}

		for setPosition := range exerciseSet.Sets {
			occurrences[setOccurrence{
				exerciseID: exerciseSet.ExerciseID,
				position:   setPosition,
			}] = occurrence.ID
		}
	}

	return occurrences, nil
}

// setOccurrencesOf reads the blocks a workout's stored sets belong to, so an
// edit that rewrites the rows can put each of them back where it was.
func setOccurrencesOf(sets []*training.Set) map[setOccurrence]uuid.UUID {
	occurrences := make(map[setOccurrence]uuid.UUID, len(sets))
	for _, set := range sets {
		if set.OccurrenceID.IsNil() {
			continue
		}

		occurrences[setOccurrence{
			exerciseID: set.ExerciseID,
			position:   int(set.Position),
		}] = set.OccurrenceID
	}

	return occurrences
}
