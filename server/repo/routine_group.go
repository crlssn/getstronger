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

const (
	routineGroupFirstPosition   = 0
	routineExerciseFirstPositon = 1
)

// ListRoutineGroups returns a routine's groups in training order, each carrying
// its exercises in the order the routine works through them.
func (r *Repo) ListRoutineGroups(ctx context.Context, routineID string) ([]*training.RoutineGroup, error) {
	id := uuidFromString(routineID)

	groups, err := models.RoutineGroups.Query(
		models.SelectWhere.RoutineGroups.RoutineID.EQ(id),
		sm.OrderBy(models.RoutineGroups.Columns.Position),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("routine groups fetch: %w", err)
	}

	links, err := models.ExercisesRoutines.Query(
		models.SelectWhere.ExercisesRoutines.RoutineID.EQ(id),
		sm.OrderBy(models.ExercisesRoutines.Columns.Position),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("routine exercise links fetch: %w", err)
	}

	exercisesByID, err := r.exercisesByID(ctx, links)
	if err != nil {
		return nil, err
	}

	parsed := make([]*training.RoutineGroup, 0, len(groups))
	byID := make(map[uuid.UUID]*training.RoutineGroup, len(groups))
	for _, group := range groups {
		parsedGroup := &training.RoutineGroup{
			ID:                          group.ID.String(),
			Mode:                        group.Mode,
			RestBetweenExercisesSeconds: group.RestBetweenExercisesSeconds,
			RestBetweenRoundsSeconds:    group.RestBetweenRoundsSeconds,
			Exercises:                   make([]training.RoutineExercise, 0, len(links)),
		}
		parsed = append(parsed, parsedGroup)
		byID[group.ID] = parsedGroup
	}

	for _, link := range links {
		group, ok := byID[link.GroupID]
		if !ok {
			continue
		}
		exercise, ok := exercisesByID[link.ExerciseID]
		if !ok {
			continue
		}

		// A null column is the routine saying nothing, which leaves the
		// exercise's own rest to answer for it.
		var restSeconds *int32
		if rest, ok := link.RestSeconds.Get(); ok {
			restSeconds = &rest
		}

		group.Exercises = append(group.Exercises, training.RoutineExercise{
			Exercise:    exercise,
			RestSeconds: restSeconds,
		})
	}

	return parsed, nil
}

func (r *Repo) exercisesByID(ctx context.Context, links models.ExercisesRoutineSlice) (map[uuid.UUID]*models.Exercise, error) {
	exerciseIDs := make([]uuid.UUID, 0, len(links))
	for _, link := range links {
		exerciseIDs = append(exerciseIDs, link.ExerciseID)
	}

	exercisesByID := make(map[uuid.UUID]*models.Exercise, len(exerciseIDs))
	if len(exerciseIDs) == 0 {
		return exercisesByID, nil
	}

	exercises, err := models.Exercises.Query(
		models.SelectWhere.Exercises.ID.In(exerciseIDs...),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("routine group exercises fetch: %w", err)
	}

	for _, exercise := range exercises {
		exercisesByID[exercise.ID] = exercise
	}

	return exercisesByID, nil
}

// SetRoutineGroups replaces a routine's groups and the exercises in them. The
// flat exercise order follows the groups read end to end.
func (r *Repo) SetRoutineGroups(ctx context.Context, routine *models.Routine, groups []training.RoutineGroupDraft, exercises models.ExerciseSlice) error {
	exerciseIDs := make([]string, 0, len(exercises))
	for _, exercise := range exercises {
		exerciseIDs = append(exerciseIDs, exercise.ID.String())
	}

	if err := setRoutineGroups(ctx, r.bobExec(), routine.ID, training.NormalizeRoutineGroups(groups, exerciseIDs)); err != nil {
		return fmt.Errorf("routine groups set: %w", err)
	}

	return nil
}

// setRoutineGroups rewrites a routine's groups and exercise links. The groups
// are expected to be normalized: every exercise ID belongs to the routine's
// owner and appears exactly once.
func setRoutineGroups(ctx context.Context, exec bob.Executor, routineID uuid.UUID, groups []training.RoutineGroupDraft) error {
	if _, err := models.ExercisesRoutines.Delete(
		models.DeleteWhere.ExercisesRoutines.RoutineID.EQ(routineID),
	).Exec(ctx, exec); err != nil {
		return fmt.Errorf("routine exercises delete: %w", err)
	}

	if _, err := models.RoutineGroups.Delete(
		models.DeleteWhere.RoutineGroups.RoutineID.EQ(routineID),
	).Exec(ctx, exec); err != nil {
		return fmt.Errorf("routine groups delete: %w", err)
	}

	position := routineExerciseFirstPositon
	for index, group := range groups {
		inserted, err := models.RoutineGroups.Insert(&models.RoutineGroupSetter{
			RoutineID:                   omit.From(routineID),
			Position:                    omit.From(safe.Int32FromInt(index)),
			Mode:                        omit.From(group.Mode),
			RestBetweenExercisesSeconds: omit.From(group.RestBetweenExercisesSeconds),
			RestBetweenRoundsSeconds:    omit.From(group.RestBetweenRoundsSeconds),
		}).One(ctx, exec)
		if err != nil {
			return fmt.Errorf("routine group insert: %w", err)
		}

		links := make([]*models.ExercisesRoutineSetter, 0, len(group.Exercises))
		for _, exercise := range group.Exercises {
			links = append(links, &models.ExercisesRoutineSetter{
				RoutineID:  omit.From(routineID),
				ExerciseID: omit.From(uuidFromString(exercise.ExerciseID)),
				GroupID:    omit.From(inserted.ID),
				Position:   omit.From(safe.Int32FromInt(position)),
				// Null is the routine saying nothing, which leaves the
				// exercise's own rest to answer for this occurrence.
				RestSeconds: omitnull.FromPtr(exercise.RestSeconds),
			})
			position++
		}

		if len(links) == 0 {
			continue
		}

		if _, err = models.ExercisesRoutines.Insert(bob.ToMods(links...)).Exec(ctx, exec); err != nil {
			return fmt.Errorf("routine exercises insert: %w", err)
		}
	}

	return nil
}

// ensureRoutineGroup gives a routine somewhere to put an exercise. Routines
// always have at least one group; this covers the ones that somehow do not.
func ensureRoutineGroup(ctx context.Context, exec sqlExecutor, routineID string) error {
	if _, err := exec.ExecContext(
		ctx, `
INSERT INTO public.routine_groups (routine_id, position, mode)
SELECT $1, $2, $3
WHERE NOT EXISTS (SELECT 1 FROM public.routine_groups WHERE routine_id = $1)`,
		routineID, routineGroupFirstPosition, training.RoutineGroupModeStraight,
	); err != nil {
		return fmt.Errorf("routine group insert: %w", err)
	}

	return nil
}
