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
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
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
		ExerciseSets: parser.ExercisesFromPB(req.Msg.GetExerciseSets()),
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

	// TODO: Analyse query performance.
	workout, err := h.repo.GetWorkout(ctx,
		repo.GetWorkoutWithID(req.Msg.GetId()),
		repo.GetWorkoutLoadSets(),
		repo.GetWorkoutLoadUser(),
		repo.GetWorkoutLoadComments(),
		repo.GetWorkoutLoadExercises(),
		repo.GetWorkoutLoadCommentUsers(),
	)
	if err != nil {
		log.Error("failed to get workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	var exercises orm.ExerciseSlice
	for _, set := range workout.R.Sets {
		exercises = append(exercises, set.R.GetExercise())
	}

	var commentUsers orm.UserSlice
	for _, comment := range workout.R.GetWorkoutComments() {
		commentUsers = append(commentUsers, comment.R.GetUser())
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, workout.UserID)
	if err != nil {
		log.Error("failed to get personal bests", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	w, err := parser.Workout(workout,
		parser.WorkoutUser(workout.R.GetUser()),
		parser.WorkoutComments(workout.R.GetWorkoutComments(), commentUsers),
		parser.WorkoutExerciseSets(exercises, workout.R.GetSets(), personalBests),
	)
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

func (h *workoutHandler) ListWorkouts(ctx context.Context, req *connect.Request[apiv1.ListWorkoutsRequest]) (*connect.Response[apiv1.ListWorkoutsResponse], error) { //nolint:cyclop // TODO: Make less complex
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsLoadSets(),
		repo.ListWorkoutsLoadUser(),
		repo.ListWorkoutsLoadExercises(),
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

	var exercises orm.ExerciseSlice
	for _, workout := range pagination.Items {
		for _, set := range workout.R.GetSets() {
			exercises = append(exercises, set.R.Exercise)
		}
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, req.Msg.GetUserIds()...)
	if err != nil {
		log.Error("failed to get personal bests", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	mapPersonalBests := make(map[string]struct{})
	for _, pb := range personalBests {
		mapPersonalBests[pb.ID] = struct{}{}
	}

	w, err := parser.WorkoutsToPB(pagination.Items, exercises, nil, mapPersonalBests)
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

	h.pubSub.Publish(ctx, orm.EventTopicWorkoutCommentPosted, payloads.WorkoutCommentPosted{
		CommentID: comment.ID,
	})

	log.Info("workout comment posted")
	return &connect.Response[apiv1.PostCommentResponse]{
		Msg: &apiv1.PostCommentResponse{
			Comment: parser.WorkoutCommentToPB(comment, user),
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

		exerciseSets := parser.ExercisesFromPB(req.Msg.GetWorkout().GetExerciseSets())
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
