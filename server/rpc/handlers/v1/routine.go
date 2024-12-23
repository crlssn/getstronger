package v1

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
	"github.com/crlssn/getstronger/server/xzap"
)

var _ apiv1connect.RoutineServiceHandler = (*routineHandler)(nil)

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
		Id: routine.ID,
	}), nil
}

func (h *routineHandler) GetRoutine(ctx context.Context, req *connect.Request[apiv1.GetRoutineRequest]) (*connect.Response[apiv1.GetRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx).
		With(xzap.FiledRoutineID(req.Msg.GetId()))
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(ctx,
		repo.GetRoutineWithID(req.Msg.GetId()),
		repo.GetRoutineWithUserID(userID),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("get routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	mapExercises := make(map[string]*orm.Exercise, len(routine.R.Exercises))
	for _, exercise := range routine.R.Exercises {
		mapExercises[exercise.ID] = exercise
	}

	var exerciseIDs []string
	if err = json.Unmarshal(routine.ExerciseOrder, &exerciseIDs); err != nil {
		log.Error("unmarshal exercise order failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	routine.R.Exercises = nil
	for _, exerciseID := range exerciseIDs {
		exercise, ok := mapExercises[exerciseID]
		if !ok {
			log.Error("exercise not found", zap.String("exercise_id", exerciseID))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
		routine.R.Exercises = append(routine.R.Exercises, exercise)
	}

	log.Info("routine returned")
	return connect.NewResponse(&apiv1.GetRoutineResponse{
		Routine: parser.Routine(routine),
	}), nil
}

func (h *routineHandler) UpdateRoutine(ctx context.Context, req *connect.Request[apiv1.UpdateRoutineRequest]) (*connect.Response[apiv1.UpdateRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(ctx,
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

	exercises, err := h.repo.ListExercises(ctx,
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
		if err = tx.UpdateRoutine(ctx, routine.ID,
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

	routine, err = h.repo.GetRoutine(ctx,
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

	if routine.UserID != userID {
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
	routines, err := h.repo.ListRoutines(ctx,
		repo.ListRoutinesWithName(req.Msg.GetName()),
		repo.ListRoutinesWithLimit(limit+1),
		repo.ListRoutinesWithUserID(userID),
		repo.ListRoutinesWithPageToken(req.Msg.GetPagination().GetPageToken()),
	)
	if err != nil {
		log.Error("list routines failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(routines, limit, func(routine *orm.Routine) time.Time {
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

func (h *routineHandler) AddExercise(ctx context.Context, req *connect.Request[apiv1.AddExerciseRequest]) (*connect.Response[apiv1.AddExerciseResponse], error) { //nolint:dupl
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(ctx,
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

	exercise, err := h.repo.GetExercise(ctx,
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

	routine, err := h.repo.GetRoutine(ctx,
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

	exercise, err := h.repo.GetExercise(ctx,
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

	routine, err := h.repo.GetRoutine(ctx,
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

	if routine.UserID != userID {
		log.Error("routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if len(req.Msg.GetExerciseIds()) != len(routine.R.Exercises) {
		log.Warn("unexpected exercise count", zap.Int("expected", len(routine.R.Exercises)), zap.Int("actual", len(req.Msg.GetExerciseIds())))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	mapExpectedExerciseIDs := make(map[string]struct{}, len(routine.R.Exercises))
	for _, exercise := range routine.R.Exercises {
		mapExpectedExerciseIDs[exercise.ID] = struct{}{}
	}

	for _, exerciseID := range req.Msg.GetExerciseIds() {
		if _, ok := mapExpectedExerciseIDs[exerciseID]; !ok {
			log.Warn("unexpected exercise ID", zap.String("exercise_id", exerciseID))
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
	}

	if err = h.repo.UpdateRoutine(ctx, routine.ID, repo.UpdateRoutineExerciseOrder(req.Msg.GetExerciseIds())); err != nil {
		log.Error("update routine failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise order updated")
	return connect.NewResponse(&apiv1.UpdateExerciseOrderResponse{}), nil
}
