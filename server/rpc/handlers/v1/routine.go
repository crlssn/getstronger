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

	exerciseIDs, err := parser.UUIDs(req.Msg.GetExerciseIds())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	groups, err := routineGroupDrafts(req.Msg.GetGroups())
	if err != nil {
		return nil, err
	}

	routine, err := h.repo.CreateRoutine(ctx, repo.CreateRoutineParams{
		UserID:      userID,
		Name:        req.Msg.GetName(),
		ExerciseIDs: exerciseIDs,
		Groups:      groups,
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
	routineID, err := parser.UUID(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	log := xcontext.MustExtractLogger(ctx).With(xzap.FiledRoutineID(routineID))
	userID := xcontext.MustExtractUserID(ctx)

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(routineID),
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

	groups, err := h.repo.ListRoutineGroups(ctx, routine.ID)
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

	routineID, err := parser.UUID(req.Msg.GetRoutine().GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	update, err := routineUpdateFrom(req.Msg.GetRoutine())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	routine, err := h.routineToUpdate(ctx, log, routineID, userID)
	if err != nil {
		return nil, err
	}

	exercises, err := h.repo.ListExercises(
		ctx,
		repo.ListExercisesWithIDs(update.exerciseIDs),
		repo.ListExercisesWithUserID(userID),
	)
	if err != nil {
		log.Error("List exercises for routine update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	routineExercises, err := training.ResolveRoutineExercises(exercises, update.exerciseIDs)
	if err != nil {
		log.Warn("Routine exercises unresolved", zap.Stringers("exercise_ids", update.exerciseIDs), zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.NewTx(ctx, func(tx *repo.Repo) error {
		if err = tx.UpdateRoutine(
			ctx, routine.ID,
			repo.UpdateRoutineName(req.Msg.GetRoutine().GetName()),
		); err != nil {
			return fmt.Errorf("routine update: %w", err)
		}

		// The exercises were listed by ID set; positions follow the requested
		// order, which the groups themselves carry when there are any.
		if err = tx.SetRoutineGroups(ctx, routine, update.groups, routineExercises); err != nil {
			return fmt.Errorf("set routine groups: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("Update routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	updated, err := h.updatedRoutine(ctx, log, routineID)
	if err != nil {
		return nil, err
	}

	log.Info("Routine updated")
	return connect.NewResponse(&apiv1.UpdateRoutineResponse{Routine: updated}), nil
}

// routineUpdate is what a request asks a routine to become, read off the
// request alone: which exercises it holds, in training order, and the blocks
// they are worked through in.
type routineUpdate struct {
	exerciseIDs []uuid.UUID
	groups      []training.RoutineGroupDraft
}

func routineUpdateFrom(routine *apiv1.Routine) (routineUpdate, error) {
	exerciseIDs, err := requestedRoutineExerciseIDs(routine)
	if err != nil {
		return routineUpdate{}, err
	}

	groups, err := routineGroupDrafts(routine.GetGroups())
	if err != nil {
		return routineUpdate{}, err
	}

	return routineUpdate{exerciseIDs: exerciseIDs, groups: groups}, nil
}

// routineToUpdate is the athlete's own routine the request names.
func (h *routineLibrary) routineToUpdate(
	ctx context.Context, log *zap.Logger, routineID, userID uuid.UUID,
) (*training.Routine, error) {
	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(routineID),
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

	return routine, nil
}

// updatedRoutine reads the routine back with everything the response shows.
func (h *routineLibrary) updatedRoutine(
	ctx context.Context, log *zap.Logger, routineID uuid.UUID,
) (*apiv1.Routine, error) {
	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(routineID),
		repo.GetRoutineWithExercises(),
	)
	if err != nil {
		log.Error("Get routine after update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	groups, err := h.repo.ListRoutineGroups(ctx, routine.ID)
	if err != nil {
		log.Error("List groups for updated routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return parser.RoutineWithGroups(routine, groups), nil
}

// requestedRoutineExerciseIDs is every exercise the request names, in the order
// the routine will be trained in. A client that sends groups need not repeat
// them in the flat list, and one that sends no groups keeps working as before.
func requestedRoutineExerciseIDs(routine *apiv1.Routine) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(routine.GetExercises()))
	seen := make(map[uuid.UUID]struct{}, len(routine.GetExercises()))

	for _, group := range routine.GetGroups() {
		for _, entry := range group.GetExercises() {
			id, err := parser.UUID(entry.GetExercise().GetId())
			if err != nil {
				return nil, connect.NewError(connect.CodeInvalidArgument, nil)
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}

	for _, exercise := range routine.GetExercises() {
		id, err := parser.UUID(exercise.GetId())
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, nil)
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}

	return ids, nil
}

func routineGroupDrafts(groups []*apiv1.RoutineGroup) ([]training.RoutineGroupDraft, error) {
	drafts := make([]training.RoutineGroupDraft, 0, len(groups))
	for _, group := range groups {
		exercises := make([]training.RoutineExerciseDraft, 0, len(group.GetExercises()))
		for _, entry := range group.GetExercises() {
			exerciseID, err := parser.UUID(entry.GetExercise().GetId())
			if err != nil {
				return nil, connect.NewError(connect.CodeInvalidArgument, nil)
			}

			// A request that names a group names the rest with it, so the
			// occurrence is stated rather than left to a default.
			rest := entry.GetRestSeconds()
			exercises = append(exercises, training.RoutineExerciseDraft{
				ExerciseID:  exerciseID,
				RestSeconds: &rest,
			})
		}

		drafts = append(drafts, training.RoutineGroupDraft{
			Mode:                        parser.RoutineGroupModeFromProto(group.GetMode()),
			RestBetweenExercisesSeconds: group.GetRestBetweenExercisesSeconds(),
			RestBetweenRoundsSeconds:    group.GetRestBetweenRoundsSeconds(),
			Rounds:                      group.GetRounds(),
			Exercises:                   exercises,
		})
	}

	return drafts, nil
}

func (h *routineLibrary) DeleteRoutine(ctx context.Context, req *connect.Request[apiv1.DeleteRoutineRequest]) (*connect.Response[apiv1.DeleteRoutineResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	routineID, err := parser.UUID(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	routine, err := h.repo.GetRoutine(ctx, repo.GetRoutineWithID(routineID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Routine not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find routine for deletion", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if routine.UserID != userID {
		log.Error("Routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = h.repo.SoftDeleteRoutine(ctx, routineID); err != nil {
		log.Error("Soft delete routine", zap.Error(err))
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

	pagination, err := repo.PaginateSlice(routines, limit, func(routine *training.Routine) (time.Time, uuid.UUID) {
		return routine.CreatedAt, routine.ID
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

	routineID, err := parser.UUID(req.Msg.GetRoutineId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	exerciseID, err := parser.UUID(req.Msg.GetExerciseId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(routineID),
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
		repo.GetExerciseWithID(exerciseID),
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

	routineID, err := parser.UUID(req.Msg.GetRoutineId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	exerciseIDs, err := parser.UUIDs(req.Msg.GetExerciseIds())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	routine, err := h.repo.GetRoutine(
		ctx,
		repo.GetRoutineWithID(routineID),
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

	if routine.UserID != userID {
		log.Error("Routine does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	if err = training.ValidateExerciseOrder(routine.Exercises, exerciseIDs); err != nil {
		log.Warn("Exercise order does not match routine", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	if err = h.repo.UpdateRoutineExerciseOrder(ctx, routine.ID, exerciseIDs); err != nil {
		log.Error("Update exercise order", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Exercise order updated")
	return connect.NewResponse(&apiv1.UpdateExerciseOrderResponse{}), nil
}
