package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"

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
	repo   *repo.Repo
	pubSub *pubsub.PubSub
}

func NewWorkoutHandler(r *repo.Repo, ps *pubsub.PubSub) apiv1connect.WorkoutServiceHandler {
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

	ids, err := workoutRequestIDsFrom(req.Msg, userID)
	if err != nil {
		return nil, err
	}

	workoutName, err := h.resolveWorkoutName(ctx, req.Msg, ids)
	if err != nil {
		return nil, err
	}

	session, err := workoutSessionFrom(req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	workout, planAdvanceSkipped, err := h.createWorkout(ctx, req.Msg, ids, workoutName, period, session)
	if errors.Is(err, training.ErrWorkoutAlreadySaved) {
		return h.savedWorkout(ctx, ids.idempotencyKey, ids.user)
	}
	if err != nil {
		log.Error("Create workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	if planAdvanceSkipped != nil {
		log.Warn(
			"Workout saved without advancing plan",
			zap.Stringer("plan_id", ids.plan),
			zap.Stringer("routine_id", ids.routine),
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

// savedWorkout answers a repeated save — one the offline queue replayed, or a
// finish pressed again after its reply was lost — with the workout the first
// attempt stored, so a session is never saved twice.
func (h *workoutHandler) savedWorkout(ctx context.Context, key, userID uuid.UUID) (*connect.Response[apiv1.CreateWorkoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	workout, err := h.repo.GetWorkout(
		ctx,
		repo.GetWorkoutWithUserID(userID),
		repo.GetWorkoutWithIdempotencyKey(key),
	)
	if err != nil {
		log.Error("Get workout for repeated save", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Repeated workout save answered with the saved workout")
	return &connect.Response[apiv1.CreateWorkoutResponse]{
		Msg: &apiv1.CreateWorkoutResponse{
			WorkoutId: workout.ID.String(),
		},
	}, nil
}

func (h *workoutHandler) resolveWorkoutName(ctx context.Context, request *apiv1.CreateWorkoutRequest, ids workoutRequestIDs) (string, error) {
	log := xcontext.MustExtractLogger(ctx)
	if ids.routine.IsNil() {
		if !ids.plan.IsNil() {
			log.Warn("Plan workout is missing a routine")
			return "", connect.NewError(connect.CodeInvalidArgument, nil)
		}

		return training.WorkoutName("", request.GetWorkoutName()), nil
	}

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(ids.routine),
		repo.GetRoutineWithUserID(ids.user),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found")
			return "", connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Get routine for workout name", zap.Error(err))
		return "", connect.NewError(connect.CodeInternal, nil)
	}

	return training.WorkoutName(routine.Name, request.GetWorkoutName()), nil
}

func (h *workoutHandler) createWorkout(
	ctx context.Context,
	request *apiv1.CreateWorkoutRequest,
	ids workoutRequestIDs,
	workoutName string,
	period training.Period,
	session workoutSession,
) (*training.Workout, error, error) {
	var workout *training.Workout
	var planAdvanceSkipped error
	err := h.repo.NewTx(ctx, func(tx *repo.Repo) error {
		createdWorkout, createErr := tx.CreateWorkout(ctx, repo.CreateWorkoutParams{
			Name:         workoutName,
			Note:         request.GetNote(),
			UserID:       ids.user,
			RoutineID:    ids.routine,
			StartedAt:    period.StartedAt,
			FinishedAt:   period.FinishedAt,
			ExerciseSets: session.exerciseSets,
			Groups:       session.groups,

			IdempotencyKey: ids.idempotencyKey,
		})
		if createErr != nil {
			return fmt.Errorf("create workout: %w", createErr)
		}
		workout = createdWorkout

		if ids.plan.IsNil() {
			return nil
		}

		_, advanceErr := tx.AdvancePlan(ctx, ids.plan, ids.user, ids.routine)
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

// workoutGroups states a request's blocks in the training vocabulary, resolved
// against the sets the request logged.
func workoutGroups(groups []*apiv1.WorkoutGroup, exerciseSets []repo.ExerciseSet) ([]training.WorkoutGroup, error) {
	setCounts := make(map[uuid.UUID]int, len(exerciseSets))
	for _, exerciseSet := range exerciseSets {
		setCounts[exerciseSet.ExerciseID] = len(exerciseSet.Sets)
	}

	drafts := make([]training.WorkoutGroupDraft, 0, len(groups))
	for _, group := range groups {
		exercises := make([]training.WorkoutGroupExerciseDraft, 0, len(group.GetExercises()))
		for _, entry := range group.GetExercises() {
			exerciseID, err := parser.UUID(entry.GetExercise().GetId())
			if err != nil {
				return nil, connect.NewError(connect.CodeInvalidArgument, nil)
			}

			exercises = append(exercises, training.WorkoutGroupExerciseDraft{
				ExerciseID: exerciseID,
				SetCount:   int(entry.GetSetCount()),
			})
		}

		drafts = append(drafts, training.WorkoutGroupDraft{
			Mode:                        parser.RoutineGroupModeFromProto(group.GetMode()),
			RestBetweenExercisesSeconds: group.GetRestBetweenExercisesSeconds(),
			RestBetweenRoundsSeconds:    group.GetRestBetweenRoundsSeconds(),
			Rounds:                      group.GetRounds(),
			Exercises:                   exercises,
		})
	}

	return training.NormalizeWorkoutGroups(drafts, setCounts), nil
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
	workoutID, err := parser.UUID(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	workout, err := h.repo.GetWorkout(
		ctx,
		repo.GetWorkoutWithID(workoutID),
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

	personalBests, err := h.repo.GetPersonalBests(ctx, workout.UserID)
	if err != nil {
		log.Error("Get personal bests for workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	// Only the full workout is read in its blocks: the feed and the history
	// list show a session's totals, not how it was worked through.
	groups, err := h.repo.ListWorkoutGroups(ctx, workout.ID)
	if err != nil {
		log.Error("List workout groups for workout", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Workout fetched")
	return &connect.Response[apiv1.GetWorkoutResponse]{
		Msg: &apiv1.GetWorkoutResponse{
			Workout: parser.Workout(
				workout,
				parser.WorkoutIntensity(workout.Sets),
				parser.WorkoutExerciseSets(workout.Sets, personalBests),
				parser.WorkoutBlocks(groups[workout.ID], workout.Sets, personalBests),
			),
		},
	}, nil
}

func (h *workoutHandler) ListWorkouts(ctx context.Context, req *connect.Request[apiv1.ListWorkoutsRequest]) (*connect.Response[apiv1.ListWorkoutsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	userIDs, err := parser.UUIDs(req.Msg.GetUserIds())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	limit := int(req.Msg.GetPagination().GetPageLimit())
	workouts, err := h.repo.ListWorkouts(
		ctx,
		repo.ListWorkoutsLoadSets(),
		repo.ListWorkoutsLoadUser(),
		repo.ListWorkoutsLoadExercises(),
		repo.ListWorkoutsWithLimit(limit+1),
		repo.ListWorkoutsWithUserIDs(userIDs...),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPagination().GetPageToken()),
	)
	if err != nil {
		log.Error("List workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(workouts, limit, func(workout *training.Workout) (time.Time, uuid.UUID) {
		return workout.CreatedAt, workout.ID
	})
	if err != nil {
		log.Error("Paginate workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, userIDs...)
	if err != nil {
		log.Error("Get personal bests for workout list", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	w := parser.WorkoutSlice(pagination.Items, personalBests)

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

	workoutID, err := parser.UUID(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.DeleteWorkout(
		ctx,
		repo.DeleteWorkoutWithID(workoutID),
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

	workoutID, err := parser.UUID(req.Msg.GetWorkoutId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	comment, err := h.repo.CreateWorkoutComment(ctx, repo.CreateWorkoutCommentParams{
		UserID:    userID,
		WorkoutID: workoutID,
		Comment:   req.Msg.GetComment(),
	}, h.repo.PostCreateWorkoutCommentLoadUser(ctx))
	if err != nil {
		log.Error("Create workout comment", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	h.pubSub.Publish(ctx, events.TopicWorkoutCommentPosted, events.WorkoutCommentPosted{
		CommentID: comment.ID,
		EventID:   uuid.Must(uuid.NewV4()),
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

	workoutID, err := parser.UUID(req.Msg.GetWorkout().GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	workout, err := h.repo.GetWorkout(ctx, repo.GetWorkoutWithID(workoutID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Workout not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Get workout for update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if workout.UserID != userID {
		log.Error("Workout does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	exerciseSets, err := parser.ExerciseSetsFromPB(req.Msg.GetWorkout().GetExerciseSets())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.NewTx(ctx, func(tx *repo.Repo) error {
		if err = tx.UpdateWorkout(
			ctx, workout.ID,
			repo.UpdateWorkoutName(req.Msg.GetWorkout().GetName()),
			repo.UpdateWorkoutNote(req.Msg.GetWorkout().GetNote()),
			repo.UpdateWorkoutStartedAt(period.StartedAt),
			repo.UpdateWorkoutFinishedAt(period.FinishedAt),
		); err != nil {
			return fmt.Errorf("update workout: %w", err)
		}

		if err = tx.UpdateWorkoutSets(ctx, repo.UpdateWorkoutSetsParams{
			WorkoutID:    workout.ID,
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

// workoutRequestIDs are the rows a save names: the athlete who trained, the
// routine and plan it was trained against, and the key naming the attempt.
// Everything but the athlete is optional and reads as the nil UUID when the
// request says nothing.
type workoutRequestIDs struct {
	user           uuid.UUID
	routine        uuid.UUID
	plan           uuid.UUID
	idempotencyKey uuid.UUID
}

func workoutRequestIDsFrom(request *apiv1.CreateWorkoutRequest, userID uuid.UUID) (workoutRequestIDs, error) {
	routineID, err := parser.OptionalUUID(request.GetRoutineId())
	if err != nil {
		return workoutRequestIDs{}, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	planID, err := parser.OptionalUUID(request.GetPlanId())
	if err != nil {
		return workoutRequestIDs{}, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	idempotencyKey, err := parser.OptionalUUID(request.GetIdempotencyKey())
	if err != nil {
		return workoutRequestIDs{}, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	return workoutRequestIDs{
		user:           userID,
		routine:        routineID,
		plan:           planID,
		idempotencyKey: idempotencyKey,
	}, nil
}

// workoutSession is the work a save logged, read off the request before the
// transaction opens: nothing here needs the database, and a request naming a
// row with something that is not an id is answered rather than rolled back.
type workoutSession struct {
	exerciseSets []repo.ExerciseSet
	groups       []training.WorkoutGroup
}

func workoutSessionFrom(request *apiv1.CreateWorkoutRequest) (workoutSession, error) {
	exerciseSets, err := parser.ExerciseSetsFromPB(request.GetExerciseSets())
	if err != nil {
		return workoutSession{}, fmt.Errorf("workout exercise sets: %w", err)
	}

	groups, err := workoutGroups(request.GetGroups(), exerciseSets)
	if err != nil {
		return workoutSession{}, fmt.Errorf("workout groups: %w", err)
	}

	return workoutSession{exerciseSets: exerciseSets, groups: groups}, nil
}
