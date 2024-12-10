package v1

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/bus/events"
	"github.com/crlssn/getstronger/server/bus/payloads"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

var _ apiv1connect.WorkoutServiceHandler = (*workoutHandler)(nil)

type workoutHandler struct {
	bus  *bus.Bus
	repo *repo.Repo
}

func NewWorkoutHandler(b *bus.Bus, r *repo.Repo) apiv1connect.WorkoutServiceHandler {
	return &workoutHandler{b, r}
}

func (h *workoutHandler) Create(ctx context.Context, req *connect.Request[v1.CreateWorkoutRequest]) (*connect.Response[v1.CreateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if req.Msg.GetStartedAt().AsTime().After(req.Msg.GetFinishedAt().AsTime()) {
		log.Warn("workout cannot start after it finishes")
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

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
		StartedAt:    req.Msg.GetStartedAt().AsTime(),
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
		repo.GetWorkoutWithSets(),
		repo.GetWorkoutWithComments(),
	)
	if err != nil {
		log.Error("failed to get workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	userIDs := make([]string, 0, len(workout.R.WorkoutComments))
	for _, comment := range workout.R.WorkoutComments {
		userIDs = append(userIDs, comment.UserID)
	}

	users, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(append(userIDs, userID)))
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exerciseIDs := make([]string, 0, len(workout.R.Sets))
	for _, set := range workout.R.Sets {
		exerciseIDs = append(exerciseIDs, set.ExerciseID)
	}

	exercises, err := h.repo.ListExercises(ctx, repo.ListExercisesWithIDs(exerciseIDs))
	if err != nil {
		log.Error("failed to list exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	w, err := parseWorkoutToPB(workout, exercises, users)
	if err != nil {
		log.Error("failed to parse workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout fetched")
	return &connect.Response[v1.GetWorkoutResponse]{
		Msg: &v1.GetWorkoutResponse{
			Workout: w,
		},
	}, nil
}

func (h *workoutHandler) List(ctx context.Context, req *connect.Request[v1.ListWorkoutsRequest]) (*connect.Response[v1.ListWorkoutsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPageSize())
	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsWithSets(),
		repo.ListWorkoutsWithLimit(limit+1),
		repo.ListWorkoutsWithUserIDs(req.Msg.GetUserIds()),
		repo.ListWorkoutsWithComments(),
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

	var userIDs []string
	var exerciseIDs []string
	for _, workout := range pagination.Items {
		for _, set := range workout.R.Sets {
			exerciseIDs = append(exerciseIDs, set.ExerciseID)
		}
		for _, comment := range workout.R.WorkoutComments {
			userIDs = append(userIDs, comment.UserID)
		}
	}

	exercises, err := h.repo.ListExercises(ctx, repo.ListExercisesWithIDs(exerciseIDs))
	if err != nil {
		log.Error("failed to list exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	users, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(userIDs))
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	w, err := parseWorkoutSliceToPB(pagination.Items, exercises, users)
	if err != nil {
		log.Error("failed to parse workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workouts listed")
	return &connect.Response[v1.ListWorkoutsResponse]{
		Msg: &v1.ListWorkoutsResponse{
			Workouts:      w,
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
		if errors.Is(err, sql.ErrNoRows) {
			log.Error("workout not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("failed to delete workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout deleted")
	return &connect.Response[v1.DeleteWorkoutResponse]{}, nil
}

func (h *workoutHandler) PostComment(ctx context.Context, req *connect.Request[v1.PostCommentRequest]) (*connect.Response[v1.PostCommentResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	comment, err := h.repo.CreateWorkoutComment(ctx, repo.CreateWorkoutCommentParams{
		UserID:    userID,
		WorkoutID: req.Msg.GetWorkoutId(),
		Comment:   req.Msg.GetComment(),
	})
	if err != nil {
		log.Error("failed to create workout comment", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(comment.UserID))
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.bus.Publish(events.WorkoutCommentPosted, &payloads.WorkoutCommentPosted{
		CommentID: comment.ID,
	}); err != nil {
		log.Error("failed to publish event", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout comment posted")
	return &connect.Response[v1.PostCommentResponse]{
		Msg: &v1.PostCommentResponse{
			Comment: parseWorkoutCommentToPB(comment, user),
		},
	}, nil
}

var errWorkoutMustStartBeforeFinish = errors.New("workout must start before it finishes")

func (h *workoutHandler) UpdateWorkout(ctx context.Context, req *connect.Request[v1.UpdateWorkoutRequest]) (*connect.Response[v1.UpdateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if req.Msg.GetWorkout().GetStartedAt().AsTime().After(req.Msg.GetWorkout().GetFinishedAt().AsTime()) {
		log.Warn("workout cannot start after it finishes")
		return nil, connect.NewError(connect.CodeInvalidArgument, errWorkoutMustStartBeforeFinish)
	}

	workout, err := h.repo.GetWorkout(ctx, repo.GetWorkoutWithID(req.Msg.GetWorkout().GetId()))
	if err != nil {
		log.Error("failed to get workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if workout.UserID != userID {
		log.Error("workout does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = h.repo.UpdateWorkout(ctx, workout.ID, repo.UpdateWorkoutParams{
		Name:         workout.Name,
		StartedAt:    req.Msg.GetWorkout().GetStartedAt().AsTime(),
		FinishedAt:   req.Msg.GetWorkout().GetFinishedAt().AsTime(),
		ExerciseSets: parseExerciseSetsFromPB(req.Msg.GetWorkout().GetExerciseSets()),
	}); err != nil {
		log.Error("failed to create workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout updated")
	return &connect.Response[v1.UpdateWorkoutResponse]{}, nil
}
