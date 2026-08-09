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
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrWorkoutMustStartBeforeFinish)
	}

	workoutName, err := h.resolveWorkoutName(ctx, req.Msg, userID)
	if err != nil {
		return nil, err
	}

	workout, planAdvanceSkipped, err := h.createWorkout(ctx, req.Msg, userID, workoutName)
	if err != nil {
		log.Error("failed to create workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	if planAdvanceSkipped != nil {
		log.Warn(
			"workout saved without advancing plan",
			zap.String("plan_id", req.Msg.GetPlanId()),
			zap.String("routine_id", req.Msg.GetRoutineId()),
			zap.Error(planAdvanceSkipped),
		)
	}

	log.Info("workout finished")
	return &connect.Response[apiv1.CreateWorkoutResponse]{
		Msg: &apiv1.CreateWorkoutResponse{
			WorkoutId: workout.ID,
		},
	}, nil
}

func (h *workoutHandler) resolveWorkoutName(ctx context.Context, request *apiv1.CreateWorkoutRequest, userID string) (string, error) {
	log := xcontext.MustExtractLogger(ctx)
	if request.GetRoutineId() == "" {
		if request.GetPlanId() != "" {
			log.Warn("plan workout is missing a routine")
			return "", connect.NewError(connect.CodeInvalidArgument, nil)
		}

		if request.GetWorkoutName() != "" {
			return request.GetWorkoutName(), nil
		}

		return "Quick Workout", nil
	}

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(request.GetRoutineId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found")
			return "", connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("failed to get routine", zap.Error(err))
		return "", connect.NewError(connect.CodeInternal, nil)
	}

	return routine.Title, nil
}

func (h *workoutHandler) createWorkout(
	ctx context.Context,
	request *apiv1.CreateWorkoutRequest,
	userID string,
	workoutName string,
) (*orm.Workout, error, error) {
	var workout *orm.Workout
	var planAdvanceSkipped error
	err := h.repo.NewTx(ctx, func(tx repo.Tx) error {
		createdWorkout, createErr := tx.CreateWorkout(ctx, repo.CreateWorkoutParams{
			Name:         workoutName,
			Note:         request.GetNote(),
			UserID:       userID,
			StartedAt:    request.GetStartedAt().AsTime(),
			FinishedAt:   request.GetFinishedAt().AsTime(),
			ExerciseSets: parser.ExerciseSetsFromPB(request.GetExerciseSets()),
		})
		if createErr != nil {
			return fmt.Errorf("create workout: %w", createErr)
		}
		workout = createdWorkout

		if request.GetPlanId() == "" {
			return nil
		}

		_, advanceErr := tx.AdvancePlan(ctx, request.GetPlanId(), userID, request.GetRoutineId())
		if advanceErr == nil {
			return nil
		}
		if isPlanAdvanceSkippable(advanceErr) {
			planAdvanceSkipped = advanceErr
			return nil
		}

		return fmt.Errorf("advance plan: %w", advanceErr)
	})

	return workout, planAdvanceSkipped, err
}

func isPlanAdvanceSkippable(err error) bool {
	return errors.Is(err, repo.ErrPlanNotActive) ||
		errors.Is(err, repo.ErrPlanUnexpectedRoutine) ||
		errors.Is(err, sql.ErrNoRows)
}

func (h *workoutHandler) GetWorkout(ctx context.Context, req *connect.Request[apiv1.GetWorkoutRequest]) (*connect.Response[apiv1.GetWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	// TODO: Analyse query performance.
	workout, err := h.repo.GetWorkout(
		ctx,
		repo.GetWorkoutWithID(req.Msg.GetId()),
		repo.GetWorkoutLoadSets(),
		repo.GetWorkoutLoadUser(),
		repo.GetWorkoutLoadComments(),
		repo.GetWorkoutLoadExercises(),
		repo.GetWorkoutLoadCommentUsers(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("workout not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("failed to get workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, workout.UserID)
	if err != nil {
		log.Error("failed to get personal bests", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("workout fetched")
	return &connect.Response[apiv1.GetWorkoutResponse]{
		Msg: &apiv1.GetWorkoutResponse{
			Workout: parser.Workout(
				workout,
				parser.WorkoutIntensity(workout.R.GetSets()),
				parser.WorkoutExerciseSets(workout.R.GetSets(), personalBests),
			),
		},
	}, nil
}

func (h *workoutHandler) ListWorkouts(ctx context.Context, req *connect.Request[apiv1.ListWorkoutsRequest]) (*connect.Response[apiv1.ListWorkoutsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	workouts, err := h.repo.ListWorkouts(
		ctx,
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

	personalBests, err := h.repo.GetPersonalBests(ctx, req.Msg.GetUserIds()...)
	if err != nil {
		log.Error("failed to get personal bests", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	w, err := parser.WorkoutSlice(pagination.Items, personalBests)
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

	if err := h.repo.DeleteWorkout(
		ctx,
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
	}, h.repo.PostCreateWorkoutCommentLoadUser(ctx))
	if err != nil {
		log.Error("failed to create workout comment", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	h.pubSub.Publish(ctx, orm.EventTopicWorkoutCommentPosted, payloads.WorkoutCommentPosted{
		CommentID: comment.ID,
	})

	log.Info("workout comment posted")
	return &connect.Response[apiv1.PostCommentResponse]{
		Msg: &apiv1.PostCommentResponse{
			Comment: parser.WorkoutComment(comment),
		},
	}, nil
}

var ErrWorkoutMustStartBeforeFinish = errors.New("workout must start before it finishes")

func (h *workoutHandler) UpdateWorkout(ctx context.Context, req *connect.Request[apiv1.UpdateWorkoutRequest]) (*connect.Response[apiv1.UpdateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if req.Msg.GetWorkout().GetStartedAt().AsTime().After(req.Msg.GetWorkout().GetFinishedAt().AsTime()) {
		log.Warn("workout cannot start after it finishes")
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrWorkoutMustStartBeforeFinish)
	}

	workout, err := h.repo.GetWorkout(ctx, repo.GetWorkoutWithID(req.Msg.GetWorkout().GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("workout not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("failed to get workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if workout.UserID != userID {
		log.Error("workout does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = h.repo.NewTx(ctx, func(tx repo.Tx) error {
		if err = tx.UpdateWorkout(
			ctx, workout.ID,
			repo.UpdateWorkoutName(req.Msg.GetWorkout().GetName()),
			repo.UpdateWorkoutNote(req.Msg.GetWorkout().GetNote()),
			repo.UpdateWorkoutStartedAt(req.Msg.GetWorkout().GetStartedAt().AsTime()),
			repo.UpdateWorkoutFinishedAt(req.Msg.GetWorkout().GetFinishedAt().AsTime()),
		); err != nil {
			return fmt.Errorf("failed to update workout: %w", err)
		}

		exerciseSets := parser.ExerciseSetsFromPB(req.Msg.GetWorkout().GetExerciseSets())
		if err = tx.UpdateWorkoutSets(ctx, repo.UpdateWorkoutSetsParams{
			WorkoutID:    workout.ID,
			ExerciseSets: exerciseSets,
		}); err != nil {
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
