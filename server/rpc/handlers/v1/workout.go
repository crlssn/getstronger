package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
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

	period, err := training.NewPeriod(req.Msg.GetStartedAt().AsTime(), req.Msg.GetFinishedAt().AsTime())
	if err != nil {
		log.Warn("Workout cannot start after it finishes")
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	workoutName, err := h.resolveWorkoutName(ctx, req.Msg, userID)
	if err != nil {
		return nil, err
	}

	workout, planAdvanceSkipped, err := h.createWorkout(ctx, req.Msg, userID, workoutName, period)
	if err != nil {
		log.Error("Create workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	if planAdvanceSkipped != nil {
		log.Warn(
			"Workout saved without advancing plan",
			zap.String("plan_id", req.Msg.GetPlanId()),
			zap.String("routine_id", req.Msg.GetRoutineId()),
			zap.Error(planAdvanceSkipped),
		)
	}

	log.Info("Workout finished")
	return &connect.Response[apiv1.CreateWorkoutResponse]{
		Msg: &apiv1.CreateWorkoutResponse{
			WorkoutId: workout.ID.String(),
		},
	}, nil
}

func (h *workoutHandler) resolveWorkoutName(ctx context.Context, request *apiv1.CreateWorkoutRequest, userID string) (string, error) {
	log := xcontext.MustExtractLogger(ctx)
	if request.GetRoutineId() == "" {
		if request.GetPlanId() != "" {
			log.Warn("Plan workout is missing a routine")
			return "", connect.NewError(connect.CodeInvalidArgument, nil)
		}

		return training.WorkoutName("", request.GetWorkoutName()), nil
	}

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(request.GetRoutineId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found")
			return "", connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Get routine for workout name", zap.Error(err))
		return "", connect.NewError(connect.CodeInternal, nil)
	}

	return training.WorkoutName(routine.Title, request.GetWorkoutName()), nil
}

func (h *workoutHandler) createWorkout(
	ctx context.Context,
	request *apiv1.CreateWorkoutRequest,
	userID string,
	workoutName string,
	period training.Period,
) (*models.Workout, error, error) {
	var workout *models.Workout
	var planAdvanceSkipped error
	err := h.repo.NewTx(ctx, func(tx repo.Tx) error {
		createdWorkout, createErr := tx.CreateWorkout(ctx, repo.CreateWorkoutParams{
			Name:         workoutName,
			Note:         request.GetNote(),
			UserID:       userID,
			RoutineID:    request.GetRoutineId(),
			StartedAt:    period.StartedAt,
			FinishedAt:   period.FinishedAt,
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

// A workout is worth keeping even when the plan refuses to rotate: the athlete
// may have trained off-plan, paused the plan, or deleted it mid-session.
func isPlanAdvanceSkippable(err error) bool {
	return errors.Is(err, training.ErrPlanNotActive) ||
		errors.Is(err, training.ErrPlanUnexpectedRoutine) ||
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
			log.Warn("Workout not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("Get workout by ID", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, workout.UserID.String())
	if err != nil {
		log.Error("Get personal bests for workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Workout fetched")
	return &connect.Response[apiv1.GetWorkoutResponse]{
		Msg: &apiv1.GetWorkoutResponse{
			Workout: parser.Workout(
				workout,
				parser.WorkoutIntensity(workout.R.Sets),
				parser.WorkoutExerciseSets(workout.R.Sets, personalBests),
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
		log.Error("List workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(workouts, limit, func(workout *models.Workout) time.Time {
		return workout.CreatedAt
	})
	if err != nil {
		log.Error("Paginate workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, req.Msg.GetUserIds()...)
	if err != nil {
		log.Error("Get personal bests for workout list", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	w, err := parser.WorkoutSlice(pagination.Items, personalBests)
	if err != nil {
		log.Error("Parse workout list", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Workouts listed")
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
			log.Error("Workout not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Delete workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Workout deleted")
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
		log.Error("Create workout comment", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	h.pubSub.Publish(ctx, events.TopicWorkoutCommentPosted, events.WorkoutCommentPosted{
		CommentID: comment.ID.String(),
		EventID:   uuid.NewString(),
	})

	log.Info("Workout comment posted")
	return &connect.Response[apiv1.PostCommentResponse]{
		Msg: &apiv1.PostCommentResponse{
			Comment: parser.WorkoutComment(comment),
		},
	}, nil
}

func (h *workoutHandler) UpdateWorkout(ctx context.Context, req *connect.Request[apiv1.UpdateWorkoutRequest]) (*connect.Response[apiv1.UpdateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	period, err := training.NewPeriod(req.Msg.GetWorkout().GetStartedAt().AsTime(), req.Msg.GetWorkout().GetFinishedAt().AsTime())
	if err != nil {
		log.Warn("Workout cannot start after it finishes")
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	workout, err := h.repo.GetWorkout(ctx, repo.GetWorkoutWithID(req.Msg.GetWorkout().GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Workout not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Get workout for update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if workout.UserID.String() != userID {
		log.Error("Workout does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = h.repo.NewTx(ctx, func(tx repo.Tx) error {
		if err = tx.UpdateWorkout(
			ctx, workout.ID.String(),
			repo.UpdateWorkoutName(req.Msg.GetWorkout().GetName()),
			repo.UpdateWorkoutNote(req.Msg.GetWorkout().GetNote()),
			repo.UpdateWorkoutStartedAt(period.StartedAt),
			repo.UpdateWorkoutFinishedAt(period.FinishedAt),
		); err != nil {
			return fmt.Errorf("update workout: %w", err)
		}

		exerciseSets := parser.ExerciseSetsFromPB(req.Msg.GetWorkout().GetExerciseSets())
		if err = tx.UpdateWorkoutSets(ctx, repo.UpdateWorkoutSetsParams{
			WorkoutID:    workout.ID.String(),
			ExerciseSets: exerciseSets,
		}); err != nil {
			return fmt.Errorf("update workout sets: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("Update workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Workout updated")
	return &connect.Response[apiv1.UpdateWorkoutResponse]{}, nil
}
