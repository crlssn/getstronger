package v1

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
	"github.com/crlssn/getstronger/server/xzap"
)

var _ apiv1connect.RoutineServiceHandler = (*routineHandler)(nil)

const (
	dashboardListLimit  = 50
	recentWorkoutLimit  = 3
	daysPerWeek         = 7
	mondayWeekdayOffset = 6
)

type routineHandler struct {
	repo repo.Repo
}

func NewRoutineHandler(r repo.Repo) apiv1connect.RoutineServiceHandler {
	return &routineHandler{r}
}

func (h *routineHandler) CreateRoutine(ctx context.Context, req *connect.Request[apiv1.CreateRoutineRequest]) (*connect.Response[apiv1.CreateRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.CreateRoutine(ctx, repo.CreateRoutineParams{
		UserID:      userID,
		Name:        req.Msg.GetName(),
		ExerciseIDs: req.Msg.GetExerciseIds(),
	})
	if err != nil {
		log.Error("create routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("routine created")
	return connect.NewResponse(&apiv1.CreateRoutineResponse{
		Id: routine.ID.String(),
	}), nil
}

func (h *routineHandler) GetRoutine(ctx context.Context, req *connect.Request[apiv1.GetRoutineRequest]) (*connect.Response[apiv1.GetRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx).
		With(xzap.FiledRoutineID(req.Msg.GetId()))
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetId()),
		repo.GetRoutineWithUserID(userID),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("get routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	orderedExercises, err := reconcileRoutineExercises(routine.R.Exercises, routine.ExerciseOrder.Val)
	if err != nil {
		log.Error("unmarshal exercise order failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	routine.R.Exercises = orderedExercises

	log.Info("routine returned")
	return connect.NewResponse(&apiv1.GetRoutineResponse{
		Routine: parser.Routine(routine),
	}), nil
}

func (h *routineHandler) UpdateRoutine(ctx context.Context, req *connect.Request[apiv1.UpdateRoutineRequest]) (*connect.Response[apiv1.UpdateRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutine().GetId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("get routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exerciseIDs := make([]string, 0, len(req.Msg.GetRoutine().GetExercises()))
	for _, exercise := range req.Msg.GetRoutine().GetExercises() {
		exerciseIDs = append(exerciseIDs, exercise.GetId())
	}

	exercises, err := h.repo.ListExercises(
		ctx,
		repo.ListExercisesWithIDs(exerciseIDs),
		repo.ListExercisesWithUserID(userID),
	)
	if err != nil {
		log.Error("list exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if len(exercises) != len(exerciseIDs) {
		log.Warn("exercise count mismatch", zap.Strings("expected", exerciseIDs), zap.Any("actual", exercises))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.NewTx(ctx, func(tx repo.Tx) error {
		if err = tx.UpdateRoutine(
			ctx, routine.ID.String(),
			repo.UpdateRoutineName(req.Msg.GetRoutine().GetName()),
			repo.UpdateRoutineExerciseOrder(exerciseIDs),
		); err != nil {
			return fmt.Errorf("routine update failed: %w", err)
		}

		if err = tx.SetRoutineExercises(ctx, routine, exercises); err != nil {
			return fmt.Errorf("set routine exercises failed: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("update routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	routine, err = h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutine().GetId()),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		log.Error("get routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("routine updated")
	return connect.NewResponse(&apiv1.UpdateRoutineResponse{
		Routine: parser.Routine(routine),
	}), nil
}

func (h *routineHandler) DeleteRoutine(ctx context.Context, req *connect.Request[apiv1.DeleteRoutineRequest]) (*connect.Response[apiv1.DeleteRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(ctx, repo.GetRoutineWithID(req.Msg.GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("exercise not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if routine.UserID.String() != userID {
		log.Error("routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = h.repo.DeleteRoutine(ctx, req.Msg.GetId()); err != nil {
		log.Error("delete routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("routine deleted")
	return connect.NewResponse(&apiv1.DeleteRoutineResponse{}), nil
}

func (h *routineHandler) ListRoutines(ctx context.Context, req *connect.Request[apiv1.ListRoutinesRequest]) (*connect.Response[apiv1.ListRoutinesResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	routines, err := h.repo.ListRoutines(
		ctx,
		repo.ListRoutinesLoadExercises(),
		repo.ListRoutinesWithName(req.Msg.GetName()),
		repo.ListRoutinesWithLimit(limit+1),
		repo.ListRoutinesWithUserID(userID),
		repo.ListRoutinesWithPageToken(req.Msg.GetPagination().GetPageToken()),
	)
	if err != nil {
		log.Error("list routines failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(routines, limit, func(routine *models.Routine) time.Time {
		return routine.CreatedAt
	})
	if err != nil {
		log.Error("paginate routines failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("routines listed")
	return connect.NewResponse(&apiv1.ListRoutinesResponse{
		Routines: parser.RoutineSlice(pagination.Items),
		Pagination: &apiv1.PaginationResponse{
			NextPageToken: pagination.NextPageToken,
		},
	}), nil
}

func (h *routineHandler) GetDashboard(ctx context.Context, req *connect.Request[apiv1.GetDashboardRequest]) (*connect.Response[apiv1.GetDashboardResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routines, err := h.repo.ListRoutines(
		ctx,
		repo.ListRoutinesLoadExercises(),
		repo.ListRoutinesWithLimit(dashboardListLimit),
		repo.ListRoutinesWithUserID(userID),
		repo.ListRoutinesWithPageToken(nil),
	)
	if err != nil {
		log.Error("dashboard routines failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	activePlan, err := h.repo.GetActivePlan(ctx, userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		log.Error("dashboard active plan failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	nextRoutine := dashboardNextRoutine(activePlan, routines, req.Msg.GetPreferredRoutineId())

	workouts, err := h.repo.ListWorkouts(
		ctx,
		repo.ListWorkoutsLoadSets(),
		repo.ListWorkoutsLoadUser(),
		repo.ListWorkoutsLoadExercises(),
		repo.ListWorkoutsWithLimit(dashboardListLimit),
		repo.ListWorkoutsWithUserIDs(userID),
		repo.ListWorkoutsWithPageToken(nil),
	)
	if err != nil {
		log.Error("dashboard workouts failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, userID)
	if err != nil {
		log.Error("dashboard personal bests failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workoutsThisWeek, volumeThisWeek := summarizeDashboardWeek(workouts, startOfWeek(time.Now().UTC()))

	recentWorkouts := workouts
	if len(recentWorkouts) > recentWorkoutLimit {
		recentWorkouts = recentWorkouts[:recentWorkoutLimit]
	}
	parsedWorkouts, err := parser.WorkoutSlice(recentWorkouts, personalBests)
	if err != nil {
		log.Error("dashboard workouts parse failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	var parsedNextRoutine *apiv1.Routine
	if nextRoutine != nil {
		parsedNextRoutine = parser.Routine(nextRoutine)
	}

	log.Info("dashboard returned")
	return connect.NewResponse(&apiv1.GetDashboardResponse{
		NextRoutine:      parsedNextRoutine,
		Routines:         parser.RoutineSlice(routines),
		WorkoutsThisWeek: workoutsThisWeek,
		VolumeThisWeek:   volumeThisWeek,
		PersonalBests:    parser.ExerciseSetSlice(personalBests),
		RecentWorkouts:   parsedWorkouts,
		ActivePlan:       parser.Plan(activePlan),
	}), nil
}

func (h *routineHandler) CreatePlan(ctx context.Context, req *connect.Request[apiv1.CreatePlanRequest]) (*connect.Response[apiv1.CreatePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := h.repo.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     userID,
		Name:       req.Msg.GetName(),
		RoutineIDs: req.Msg.GetRoutineIds(),
	})
	if err != nil {
		log.Error("create plan failed", zap.Error(err))
		if errors.Is(err, repo.ErrPlanRoutineBelongsToAnotherUser) ||
			errors.Is(err, repo.ErrPlanRoutineDeleted) ||
			errors.Is(err, repo.ErrPlanRoutineDuplicate) || errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.CreatePlanResponse{Plan: parser.Plan(plan)}), nil
}

func (h *routineHandler) GetPlan(ctx context.Context, req *connect.Request[apiv1.GetPlanRequest]) (*connect.Response[apiv1.GetPlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := h.repo.GetPlan(ctx, req.Msg.GetId(), userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		log.Error("get plan failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.GetPlanResponse{Plan: parser.Plan(plan)}), nil
}

func (h *routineHandler) ListPlans(ctx context.Context, _ *connect.Request[apiv1.ListPlansRequest]) (*connect.Response[apiv1.ListPlansResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plans, err := h.repo.ListPlans(ctx, userID)
	if err != nil {
		log.Error("list plans failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.ListPlansResponse{Plans: parser.PlanSlice(plans)}), nil
}

func (h *routineHandler) UpdatePlan(ctx context.Context, req *connect.Request[apiv1.UpdatePlanRequest]) (*connect.Response[apiv1.UpdatePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := h.repo.UpdatePlan(ctx, repo.UpdatePlanParams{
		ID:         req.Msg.GetId(),
		UserID:     userID,
		Name:       req.Msg.GetName(),
		RoutineIDs: req.Msg.GetRoutineIds(),
	})
	if err != nil {
		log.Error("update plan failed", zap.Error(err))
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		if errors.Is(err, repo.ErrPlanRoutineBelongsToAnotherUser) ||
			errors.Is(err, repo.ErrPlanRoutineDeleted) ||
			errors.Is(err, repo.ErrPlanRoutineDuplicate) {
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.UpdatePlanResponse{Plan: parser.Plan(plan)}), nil
}

func (h *routineHandler) DeletePlan(ctx context.Context, req *connect.Request[apiv1.DeletePlanRequest]) (*connect.Response[apiv1.DeletePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.DeletePlan(ctx, req.Msg.GetId(), userID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		log.Error("delete plan failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.DeletePlanResponse{}), nil
}

func (h *routineHandler) SetActivePlan(ctx context.Context, req *connect.Request[apiv1.SetActivePlanRequest]) (*connect.Response[apiv1.SetActivePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := h.repo.SetActivePlan(ctx, req.Msg.GetId(), userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		log.Error("set active plan failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.SetActivePlanResponse{Plan: parser.Plan(plan)}), nil
}

func (h *routineHandler) PauseActivePlan(ctx context.Context, _ *connect.Request[apiv1.PauseActivePlanRequest]) (*connect.Response[apiv1.PauseActivePlanResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.PauseActivePlan(ctx, userID); err != nil {
		log.Error("pause active plan failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.PauseActivePlanResponse{}), nil
}

func (h *routineHandler) SkipPlanRoutine(ctx context.Context, req *connect.Request[apiv1.SkipPlanRoutineRequest]) (*connect.Response[apiv1.SkipPlanRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	plan, err := h.repo.AdvancePlan(ctx, req.Msg.GetId(), userID, "")
	if err != nil {
		log.Error("skip plan routine failed", zap.Error(err))
		if errors.Is(err, sql.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}
		if errors.Is(err, repo.ErrPlanNotActive) || errors.Is(err, repo.ErrPlanUnexpectedRoutine) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.SkipPlanRoutineResponse{Plan: parser.Plan(plan)}), nil
}

func startOfWeek(value time.Time) time.Time {
	dayOffset := (int(value.Weekday()) + mondayWeekdayOffset) % daysPerWeek
	start := value.AddDate(0, 0, -dayOffset)
	return time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())
}

func dashboardNextRoutine(activePlan *repo.TrainingPlan, routines models.RoutineSlice, preferredRoutineID string) *models.Routine {
	if activePlan != nil && activePlan.CurrentPosition >= 0 && activePlan.CurrentPosition < len(activePlan.Routines) {
		return activePlan.Routines[activePlan.CurrentPosition]
	}

	if preferredRoutineID != "" {
		index := slices.IndexFunc(routines, func(routine *models.Routine) bool {
			return routine.ID.String() == preferredRoutineID
		})
		if index >= 0 {
			return routines[index]
		}
	}

	if len(routines) > 0 {
		return routines[0]
	}

	return nil
}

func summarizeDashboardWeek(workouts models.WorkoutSlice, weekStart time.Time) (int32, float64) {
	var workoutCount int32
	var volume float64
	for _, workout := range workouts {
		if workout.FinishedAt.Before(weekStart) {
			continue
		}
		workoutCount++
		for _, set := range workout.R.Sets {
			volume += set.Weight * float64(set.Reps)
		}
	}

	return workoutCount, volume
}

// reconcileRoutineExercises treats the relationship table as the source of truth and the
// exercise_order column as an ordering hint. Older routines can have valid relationships with an
// empty or incomplete order value; appending any omitted exercises keeps those routines usable.
func reconcileRoutineExercises(exercises models.ExerciseSlice, encodedOrder []byte) (models.ExerciseSlice, error) {
	var exerciseIDs []string
	if len(encodedOrder) > 0 {
		if err := json.Unmarshal(encodedOrder, &exerciseIDs); err != nil {
			return nil, fmt.Errorf("exercise order unmarshal: %w", err)
		}
	}

	exercisesByID := make(map[string]*models.Exercise, len(exercises))
	for _, exercise := range exercises {
		exercisesByID[exercise.ID.String()] = exercise
	}

	ordered := make(models.ExerciseSlice, 0, len(exercises))
	seen := make(map[string]struct{}, len(exercises))
	for _, exerciseID := range exerciseIDs {
		exercise, ok := exercisesByID[exerciseID]
		if !ok {
			continue
		}
		if _, duplicate := seen[exerciseID]; duplicate {
			continue
		}
		ordered = append(ordered, exercise)
		seen[exerciseID] = struct{}{}
	}

	for _, exercise := range exercises {
		if _, exists := seen[exercise.ID.String()]; exists {
			continue
		}
		ordered = append(ordered, exercise)
	}

	return ordered, nil
}

func (h *routineHandler) AddExercise(ctx context.Context, req *connect.Request[apiv1.AddExerciseRequest]) (*connect.Response[apiv1.AddExerciseResponse], error) { //nolint:dupl
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutineId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercise, err := h.repo.GetExercise(
		ctx,
		repo.GetExerciseWithID(req.Msg.GetExerciseId()),
		repo.GetExerciseWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("exercise not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.AddExerciseToRoutine(ctx, exercise, routine); err != nil {
		log.Error("add exercise to routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise added to routine")
	return connect.NewResponse(&apiv1.AddExerciseResponse{}), nil
}

func (h *routineHandler) RemoveExercise(ctx context.Context, req *connect.Request[apiv1.RemoveExerciseRequest]) (*connect.Response[apiv1.RemoveExerciseResponse], error) { //nolint:dupl
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutineId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercise, err := h.repo.GetExercise(
		ctx,
		repo.GetExerciseWithID(req.Msg.GetExerciseId()),
		repo.GetExerciseWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("exercise not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.RemoveExerciseFromRoutine(ctx, exercise, routine); err != nil {
		log.Error("remove exercise from routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise removed from routine")
	return connect.NewResponse(&apiv1.RemoveExerciseResponse{}), nil
}

func (h *routineHandler) UpdateExerciseOrder(ctx context.Context, req *connect.Request[apiv1.UpdateExerciseOrderRequest]) (*connect.Response[apiv1.UpdateExerciseOrderResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutineId()),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if routine.UserID.String() != userID {
		log.Error("routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if len(req.Msg.GetExerciseIds()) != len(routine.R.Exercises) {
		log.Warn("unexpected exercise count", zap.Int("expected", len(routine.R.Exercises)), zap.Int("actual", len(req.Msg.GetExerciseIds())))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	mapExpectedExerciseIDs := make(map[string]struct{}, len(routine.R.Exercises))
	for _, exercise := range routine.R.Exercises {
		mapExpectedExerciseIDs[exercise.ID.String()] = struct{}{}
	}

	for _, exerciseID := range req.Msg.GetExerciseIds() {
		if _, ok := mapExpectedExerciseIDs[exerciseID]; !ok {
			log.Warn("unexpected exercise ID", zap.String("exercise_id", exerciseID))
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
	}

	if err = h.repo.UpdateRoutine(ctx, routine.ID.String(), repo.UpdateRoutineExerciseOrder(req.Msg.GetExerciseIds())); err != nil {
		log.Error("update routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise order updated")
	return connect.NewResponse(&apiv1.UpdateExerciseOrderResponse{}), nil
}
