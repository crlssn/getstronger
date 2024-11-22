package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
	"github.com/crlssn/getstronger/apps/backend/pkg/xcontext"
)

var _ apiv1connect.WorkoutServiceHandler = (*workoutHandler)(nil)

type workoutHandler struct {
	repo *repo.Repo
}

func NewWorkoutHandler(r *repo.Repo) apiv1connect.WorkoutServiceHandler {
	return &workoutHandler{r}
}

func (h *workoutHandler) Create(ctx context.Context, req *connect.Request[v1.CreateWorkoutRequest]) (*connect.Response[v1.CreateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(ctx, repo.GetRoutineWithID(req.Msg.GetRoutineId()))
	if err != nil {
		log.Error("failed to get routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if routine.UserID != userID {
		log.Error("routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	workout, err := h.repo.CreateWorkout(ctx, repo.CreateWorkoutParams{
		Name:         routine.Title,
		UserID:       userID,
		FinishedAt:   req.Msg.GetFinishedAt().AsTime(),
		ExerciseSets: parseExerciseSetsFromPB(req.Msg.GetExerciseSets()),
	})
	if err != nil {
		log.Error("failed to create workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout finished")
	return &connect.Response[v1.CreateWorkoutResponse]{
		Msg: &v1.CreateWorkoutResponse{
			WorkoutId: workout.ID,
		},
	}, nil
}

func (h *workoutHandler) Get(ctx context.Context, req *connect.Request[v1.GetWorkoutRequest]) (*connect.Response[v1.GetWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	workout, err := h.repo.GetWorkout(ctx,
		repo.GetWorkoutWithID(req.Msg.GetId()),
		repo.GetWorkoutWithExerciseSets(),
	)
	if err != nil {
		log.Error("failed to get workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if workout.UserID != userID {
		log.Error("workout does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	log.Info("workout fetched")
	return &connect.Response[v1.GetWorkoutResponse]{
		Msg: &v1.GetWorkoutResponse{
			Workout: parseWorkoutToPB(workout),
		},
	}, nil
}

func (h *workoutHandler) List(ctx context.Context, req *connect.Request[v1.ListWorkoutsRequest]) (*connect.Response[v1.ListWorkoutsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

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

	pagination, err := repo.PaginateSlice(workouts, limit, func(workout *orm.Workout) time.Time {
		return workout.CreatedAt
	})
	if err != nil {
		log.Error("failed to paginate workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workouts listed")
	return &connect.Response[v1.ListWorkoutsResponse]{
		Msg: &v1.ListWorkoutsResponse{
			Workouts:      parseWorkoutSliceToPB(pagination.Items),
			NextPageToken: pagination.NextPageToken,
		},
	}, nil
}

func (h *workoutHandler) Delete(ctx context.Context, req *connect.Request[v1.DeleteWorkoutRequest]) (*connect.Response[v1.DeleteWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.DeleteWorkout(ctx,
		repo.DeleteWorkoutWithID(req.Msg.GetId()),
		repo.DeleteWorkoutWithUserID(userID),
	); err != nil {
		log.Error("failed to delete workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout deleted")
	return &connect.Response[v1.DeleteWorkoutResponse]{}, nil
}
