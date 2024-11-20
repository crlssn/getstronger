package v1

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
	"github.com/crlssn/getstronger/apps/backend/pkg/xzap"
)

var _ apiv1connect.WorkoutServiceHandler = (*workoutHandler)(nil)

type workoutHandler struct {
	log  *zap.Logger
	repo *repo.Repo
}

func NewWorkoutHandler(log *zap.Logger, r *repo.Repo) apiv1connect.WorkoutServiceHandler {
	return &workoutHandler{log, r}
}

func (h *workoutHandler) Finish(ctx context.Context, req *connect.Request[v1.FinishWorkoutRequest]) (*connect.Response[v1.FinishWorkoutResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.WorkoutServiceFinishProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))

	return &connect.Response[v1.FinishWorkoutResponse]{}, nil
}

func (h *workoutHandler) List(ctx context.Context, req *connect.Request[v1.ListWorkoutsRequest]) (*connect.Response[v1.ListWorkoutsResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.WorkoutServiceListProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))

	limit := int(req.Msg.GetPageSize())
	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsWithLimit(limit+1),
		repo.ListWorkoutsWithUserID(userID),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPageToken()),
	)
	if err != nil {
		log.Error("failed to list workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(repo.PaginateParams[*orm.Workout, orm.WorkoutSlice]{
		Items: workouts,
		Limit: limit,
		Timestamp: func(workout *orm.Workout) time.Time {
			return workout.CreatedAt
		},
	})
	if err != nil {
		log.Error("failed to paginate workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workoutsPB, err := parseWorkoutSliceToPB(pagination.Items)

	return &connect.Response[v1.ListWorkoutsResponse]{
		Msg: &v1.ListWorkoutsResponse{
			Workouts:      workoutsPB,
			NextPageToken: pagination.NextPageToken,
		},
	}, nil
}

func parseWorkoutSliceToPB(workoutSlice orm.WorkoutSlice) ([]*v1.Workout, error) {
	workouts := make([]*v1.Workout, 0, len(workoutSlice))
	for _, workout := range workoutSlice {
		w, err := parseWorkoutToPB(workout)
		if err != nil {
			return nil, fmt.Errorf("parse workout to pb: %w", err)
		}
		workouts = append(workouts, w)
	}
	return workouts, nil
}

func parseWorkoutToPB(workout *orm.Workout) (*v1.Workout, error) {
	var exerciseOrder []string
	var mapExerciseSets = make(map[string][]*v1.Set)

	if workout.R != nil {
		for _, set := range workout.R.Sets {
			if _, ok := mapExerciseSets[set.ExerciseID]; !ok {
				exerciseOrder = append(exerciseOrder, set.ExerciseID)
			}

			mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], &v1.Set{
				Weight: set.Weight,
				Reps:   int32(set.Reps),
			})
		}
	}

	var exerciseSets []*v1.ExerciseSets
	for _, exerciseID := range exerciseOrder {
		exerciseSets = append(exerciseSets, &v1.ExerciseSets{
			ExerciseId: exerciseID,
			Sets:       mapExerciseSets[exerciseID],
		})
	}

	return &v1.Workout{
		Id:           workout.ID,
		Name:         workout.Name,
		ExerciseSets: exerciseSets,
	}, nil
}
