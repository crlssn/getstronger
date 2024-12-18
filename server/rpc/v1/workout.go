package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.WorkoutServiceHandler = (*workoutHandler)(nil)

type workoutHandler struct {
	repo   repo.Repo
	pubSub *pubsub.PubSub
}

func NewWorkoutHandler(r repo.Repo, ps *pubsub.PubSub) apiv1connect.WorkoutServiceHandler {
	return &workoutHandler{r, ps}
}

func (h *workoutHandler) CreateWorkout(ctx context.Context, req *connect.Request[apiv1.CreateWorkoutRequest]) (*connect.Response[apiv1.CreateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if req.Msg.GetStartedAt().AsTime().After(req.Msg.GetFinishedAt().AsTime()) {
		log.Warn("workout cannot start after it finishes")
		return nil, connect.NewError(connect.CodeInvalidArgument, errWorkoutMustStartBeforeFinish)
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
	return &connect.Response[apiv1.CreateWorkoutResponse]{
		Msg: &apiv1.CreateWorkoutResponse{
			WorkoutId: workout.ID,
		},
	}, nil
}

func (h *workoutHandler) GetWorkout(ctx context.Context, req *connect.Request[apiv1.GetWorkoutRequest]) (*connect.Response[apiv1.GetWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	workout, err := h.repo.GetWorkout(ctx,
		repo.GetWorkoutWithID(req.Msg.GetId()),
		repo.GetWorkoutWithSets(),
		repo.GetWorkoutWithUser(),
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
	return &connect.Response[apiv1.GetWorkoutResponse]{
		Msg: &apiv1.GetWorkoutResponse{
			Workout: w,
		},
	}, nil
}

func (h *workoutHandler) ListWorkouts(ctx context.Context, req *connect.Request[apiv1.ListWorkoutsRequest]) (*connect.Response[apiv1.ListWorkoutsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsWithSets(),
		repo.ListWorkoutsWithUser(),
		repo.ListWorkoutsWithLimit(limit+1),
		repo.ListWorkoutsWithUserIDs(req.Msg.GetUserIds()...),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPagination().GetPageToken()),
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
	return &connect.Response[apiv1.ListWorkoutsResponse]{
		Msg: &apiv1.ListWorkoutsResponse{
			Workouts: w,
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: pagination.NextPageToken,
			},
		},
	}, nil
}

func (h *workoutHandler) DeleteWorkout(ctx context.Context, req *connect.Request[apiv1.DeleteWorkoutRequest]) (*connect.Response[apiv1.DeleteWorkoutResponse], error) {
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
	return &connect.Response[apiv1.DeleteWorkoutResponse]{}, nil
}

func (h *workoutHandler) PostComment(ctx context.Context, req *connect.Request[apiv1.PostCommentRequest]) (*connect.Response[apiv1.PostCommentResponse], error) {
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

	h.pubSub.Publish(events.WorkoutCommentPosted, &payloads.WorkoutCommentPosted{
		CommentID: comment.ID,
	})

	log.Info("workout comment posted")
	return &connect.Response[apiv1.PostCommentResponse]{
		Msg: &apiv1.PostCommentResponse{
			Comment: parseWorkoutCommentToPB(comment, user),
		},
	}, nil
}

var errWorkoutMustStartBeforeFinish = errors.New("workout must start before it finishes")

func (h *workoutHandler) UpdateWorkout(ctx context.Context, req *connect.Request[apiv1.UpdateWorkoutRequest]) (*connect.Response[apiv1.UpdateWorkoutResponse], error) {
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

	if err = h.repo.NewTx(ctx, func(tx repo.Tx) error {
		if err = tx.UpdateWorkout(ctx, workout.ID,
			repo.UpdateWorkoutName(req.Msg.GetWorkout().GetName()),
			repo.UpdateWorkoutStartedAt(req.Msg.GetWorkout().GetStartedAt().AsTime()),
			repo.UpdateWorkoutFinishedAt(req.Msg.GetWorkout().GetFinishedAt().AsTime()),
		); err != nil {
			return fmt.Errorf("failed to update workout: %w", err)
		}

		exerciseSets := parseExerciseSetsFromPB(req.Msg.GetWorkout().GetExerciseSets())
		if err = tx.UpdateWorkoutSets(ctx, workout.ID, exerciseSets); err != nil {
			return fmt.Errorf("failed to update workout sets: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("failed to update workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout updated")
	return &connect.Response[apiv1.UpdateWorkoutResponse]{}, nil
}
