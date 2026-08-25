package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
	"github.com/crlssn/getstronger/server/xzap"
)

// routineLibrary edits the routines an athlete has built: what each one is
// called and which exercises it holds, in which order.
type routineLibrary struct {
	repo *repo.Repo
}

func (h *routineLibrary) CreateRoutine(ctx context.Context, req *connect.Request[apiv1.CreateRoutineRequest]) (*connect.Response[apiv1.CreateRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.CreateRoutine(ctx, repo.CreateRoutineParams{
		UserID:      userID,
		Name:        req.Msg.GetName(),
		ExerciseIDs: req.Msg.GetExerciseIds(),
		Groups:      routineGroupDrafts(req.Msg.GetGroups()),
	})
	if err != nil {
		log.Error("Create routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Routine created")
	return connect.NewResponse(&apiv1.CreateRoutineResponse{
		Id: routine.ID.String(),
	}), nil
}

func (h *routineLibrary) GetRoutine(ctx context.Context, req *connect.Request[apiv1.GetRoutineRequest]) (*connect.Response[apiv1.GetRoutineResponse], error) {
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
			log.Warn("Routine not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("Get routine by ID", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	groups, err := h.repo.ListRoutineGroups(ctx, routine.ID.String())
	if err != nil {
		log.Error("List groups for routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Routine returned")
	return connect.NewResponse(&apiv1.GetRoutineResponse{
		Routine: parser.RoutineWithGroups(routine, groups),
	}), nil
}

func (h *routineLibrary) UpdateRoutine(ctx context.Context, req *connect.Request[apiv1.UpdateRoutineRequest]) (*connect.Response[apiv1.UpdateRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutine().GetId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Get routine for update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exerciseIDs := requestedRoutineExerciseIDs(req.Msg.GetRoutine())

	exercises, err := h.repo.ListExercises(
		ctx,
		repo.ListExercisesWithIDs(exerciseIDs),
		repo.ListExercisesWithUserID(userID),
	)
	if err != nil {
		log.Error("List exercises for routine update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	routineExercises, err := training.ResolveRoutineExercises(exercises, exerciseIDs)
	if err != nil {
		log.Warn("Routine exercises unresolved", zap.Strings("exercise_ids", exerciseIDs), zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.NewTx(ctx, func(tx *repo.Repo) error {
		if err = tx.UpdateRoutine(
			ctx, routine.ID.String(),
			repo.UpdateRoutineName(req.Msg.GetRoutine().GetName()),
		); err != nil {
			return fmt.Errorf("routine update: %w", err)
		}

		// The exercises were listed by ID set; positions follow the requested
		// order, which the groups themselves carry when there are any.
		if err = tx.SetRoutineGroups(
			ctx, routine,
			routineGroupDrafts(req.Msg.GetRoutine().GetGroups()),
			routineExercises,
		); err != nil {
			return fmt.Errorf("set routine groups: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("Update routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	routine, err = h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutine().GetId()),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		log.Error("Get routine after update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	groups, err := h.repo.ListRoutineGroups(ctx, routine.ID.String())
	if err != nil {
		log.Error("List groups for updated routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Routine updated")
	return connect.NewResponse(&apiv1.UpdateRoutineResponse{
		Routine: parser.RoutineWithGroups(routine, groups),
	}), nil
}

// requestedRoutineExerciseIDs is every exercise the request names, in the order
// the routine will be trained in. A client that sends groups need not repeat
// them in the flat list, and one that sends no groups keeps working as before.
func requestedRoutineExerciseIDs(routine *apiv1.Routine) []string {
	ids := make([]string, 0, len(routine.GetExercises()))
	seen := make(map[string]struct{}, len(routine.GetExercises()))

	for _, group := range routine.GetGroups() {
		for _, entry := range group.GetExercises() {
			id := entry.GetExercise().GetId()
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}

	for _, exercise := range routine.GetExercises() {
		if _, ok := seen[exercise.GetId()]; ok {
			continue
		}
		seen[exercise.GetId()] = struct{}{}
		ids = append(ids, exercise.GetId())
	}

	return ids
}

func routineGroupDrafts(groups []*apiv1.RoutineGroup) []training.RoutineGroupDraft {
	drafts := make([]training.RoutineGroupDraft, 0, len(groups))
	for _, group := range groups {
		exercises := make([]training.RoutineExerciseDraft, 0, len(group.GetExercises()))
		for _, entry := range group.GetExercises() {
			// A request that names a group names the rest with it, so the
			// occurrence is stated rather than left to a default.
			rest := entry.GetRestSeconds()
			exercises = append(exercises, training.RoutineExerciseDraft{
				ExerciseID:  entry.GetExercise().GetId(),
				RestSeconds: &rest,
			})
		}

		drafts = append(drafts, training.RoutineGroupDraft{
			Mode:                        parser.RoutineGroupModeFromProto(group.GetMode()),
			RestBetweenExercisesSeconds: group.GetRestBetweenExercisesSeconds(),
			RestBetweenRoundsSeconds:    group.GetRestBetweenRoundsSeconds(),
			Exercises:                   exercises,
		})
	}

	return drafts
}

func (h *routineLibrary) DeleteRoutine(ctx context.Context, req *connect.Request[apiv1.DeleteRoutineRequest]) (*connect.Response[apiv1.DeleteRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(ctx, repo.GetRoutineWithID(req.Msg.GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find routine for deletion", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if routine.UserID.String() != userID {
		log.Error("Routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = h.repo.DeleteRoutine(ctx, req.Msg.GetId()); err != nil {
		log.Error("Delete routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Routine deleted")
	return connect.NewResponse(&apiv1.DeleteRoutineResponse{}), nil
}

func (h *routineLibrary) ListRoutines(ctx context.Context, req *connect.Request[apiv1.ListRoutinesRequest]) (*connect.Response[apiv1.ListRoutinesResponse], error) {
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
		log.Error("List routines", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(routines, limit, func(routine *models.Routine) time.Time {
		return routine.CreatedAt
	})
	if err != nil {
		log.Error("Paginate routines", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Routines listed")
	return connect.NewResponse(&apiv1.ListRoutinesResponse{
		Routines: parser.RoutineSlice(pagination.Items),
		Pagination: &apiv1.PaginationResponse{
			NextPageToken: pagination.NextPageToken,
		},
	}), nil
}

func (h *routineLibrary) AddExercise(ctx context.Context, req *connect.Request[apiv1.AddExerciseRequest]) (*connect.Response[apiv1.AddExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutineId()),
		repo.GetRoutineWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find routine for adding exercise", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercise, err := h.repo.GetExercise(
		ctx,
		repo.GetExerciseWithID(req.Msg.GetExerciseId()),
		repo.GetExerciseWithUserID(userID),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Exercise not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find exercise to add to routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.AddExerciseToRoutine(ctx, exercise, routine); err != nil {
		log.Error("Add exercise to routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Exercise added to routine")
	return connect.NewResponse(&apiv1.AddExerciseResponse{}), nil
}

func (h *routineLibrary) UpdateExerciseOrder(ctx context.Context, req *connect.Request[apiv1.UpdateExerciseOrderRequest]) (*connect.Response[apiv1.UpdateExerciseOrderResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(req.Msg.GetRoutineId()),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find routine for exercise order update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if routine.UserID.String() != userID {
		log.Error("Routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = training.ValidateExerciseOrder(routine.R.Exercises, req.Msg.GetExerciseIds()); err != nil {
		log.Warn("Exercise order does not match routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.UpdateRoutineExerciseOrder(ctx, routine.ID.String(), req.Msg.GetExerciseIds()); err != nil {
		log.Error("Update exercise order", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Exercise order updated")
	return connect.NewResponse(&apiv1.UpdateExerciseOrderResponse{}), nil
}
