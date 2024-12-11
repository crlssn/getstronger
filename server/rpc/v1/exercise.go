package v1

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/volatiletech/null/v8"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

var _ apiv1connect.ExerciseServiceHandler = (*exerciseHandler)(nil)

type exerciseHandler struct {
	repo *repo.Repo
}

func NewExerciseHandler(r *repo.Repo) apiv1connect.ExerciseServiceHandler {
	return &exerciseHandler{r}
}

func (h *exerciseHandler) Create(ctx context.Context, req *connect.Request[v1.CreateExerciseRequest]) (*connect.Response[v1.CreateExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	exercise, err := h.repo.CreateExercise(ctx, repo.CreateExerciseParams{
		UserID: userID,
		Name:   req.Msg.GetName(),
		Label:  req.Msg.GetLabel(),
	})
	if err != nil {
		log.Error("create exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&v1.CreateExerciseResponse{
		Id: exercise.ID,
	}), nil
}

func (h *exerciseHandler) Get(ctx context.Context, req *connect.Request[v1.GetExerciseRequest]) (*connect.Response[v1.GetExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	exercise, err := h.repo.GetExercise(ctx, repo.GetExerciseWithID(req.Msg.GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Error("exercise not found", zap.String("id", req.Msg.GetId()))
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&v1.GetExerciseResponse{
		Exercise: parseExerciseToPB(exercise),
	}), nil
}

var errInvalidUpdateMaskPath = errors.New("invalid update mask path")

func (h *exerciseHandler) Update(ctx context.Context, req *connect.Request[v1.UpdateExerciseRequest]) (*connect.Response[v1.UpdateExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	exercise, err := h.repo.GetExercise(ctx, repo.GetExerciseWithID(req.Msg.GetExercise().GetId()))
	if err != nil {
		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if exercise.UserID != userID {
		log.Error("exercise does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	for _, path := range req.Msg.GetUpdateMask().GetPaths() {
		switch path {
		case "name":
			exercise.Title = req.Msg.GetExercise().GetName()
		case "label":
			exercise.SubTitle = null.NewString(req.Msg.GetExercise().GetLabel(), req.Msg.GetExercise().GetLabel() != "")
		default:
			log.Error("invalid update mask path", zap.String("path", path))
			return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidUpdateMaskPath)
		}
	}

	log.Info("updating exercise", zap.Any("exercise", exercise))
	if err = h.repo.UpdateExercise(ctx, exercise); err != nil {
		log.Error("update exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&v1.UpdateExerciseResponse{
		Exercise: parseExerciseToPB(exercise),
	}), nil
}

func (h *exerciseHandler) Delete(ctx context.Context, req *connect.Request[v1.DeleteExerciseRequest]) (*connect.Response[v1.DeleteExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.SoftDeleteExercise(ctx, repo.SoftDeleteExerciseParams{
		UserID:     userID,
		ExerciseID: req.Msg.GetId(),
	}); err != nil {
		log.Error("delete exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise deleted")
	return connect.NewResponse(&v1.DeleteExerciseResponse{}), nil
}

func (h *exerciseHandler) List(ctx context.Context, req *connect.Request[v1.ListExercisesRequest]) (*connect.Response[v1.ListExercisesResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPageSize())
	exercises, err := h.repo.ListExercises(ctx,
		repo.ListExercisesWithIDs(req.Msg.GetExerciseIds()),
		repo.ListExercisesWithName(req.Msg.GetName()),
		repo.ListExercisesWithLimit(limit+1),
		repo.ListExercisesWithUserID(userID),
		repo.ListExercisesWithPageToken(req.Msg.GetPageToken()),
		repo.ListExercisesWithoutDeleted(),
	)
	if err != nil {
		log.Error("list exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(exercises, limit, func(exercise *orm.Exercise) time.Time {
		return exercise.CreatedAt
	})
	if err != nil {
		log.Error("paginate exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercises listed")
	return connect.NewResponse(&v1.ListExercisesResponse{
		Exercises:     parseExerciseSliceToPB(pagination.Items),
		NextPageToken: pagination.NextPageToken,
	}), nil
}

func (h *exerciseHandler) GetPreviousWorkoutSets(ctx context.Context, req *connect.Request[v1.GetPreviousWorkoutSetsRequest]) (*connect.Response[v1.GetPreviousWorkoutSetsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	sets, err := h.repo.GetPreviousWorkoutSets(ctx, req.Msg.GetExerciseIds())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("no previous workout sets", zap.Any("exercise_ids", req.Msg.GetExerciseIds()))
			return &connect.Response[v1.GetPreviousWorkoutSetsResponse]{
				Msg: &v1.GetPreviousWorkoutSetsResponse{
					ExerciseSets: nil,
				},
			}, nil
		}

		log.Error("failed to get previous workout sets", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workoutIDs := make([]string, 0, len(sets))
	for _, set := range sets {
		workoutIDs = append(workoutIDs, set.WorkoutID)
	}

	workouts, err := h.repo.ListWorkouts(ctx, repo.ListWorkoutsWithIDs(workoutIDs))
	if err != nil {
		log.Error("failed to get workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	for _, workout := range workouts {
		if workout.UserID != userID {
			log.Error("workout does not belong to user")
			return nil, connect.NewError(connect.CodePermissionDenied, nil)
		}
	}

	exerciseIDs := make([]string, 0, len(sets))
	for _, set := range sets {
		exerciseIDs = append(exerciseIDs, set.ExerciseID)
	}

	exercises, err := h.repo.ListExercises(ctx, repo.ListExercisesWithIDs(exerciseIDs))
	if err != nil {
		log.Error("failed to list exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exerciseSets, err := parseSetSliceToExerciseSetsPB(sets, exercises)
	if err != nil {
		log.Error("failed to parse set slice to exercise sets", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.GetPreviousWorkoutSetsResponse]{
		Msg: &v1.GetPreviousWorkoutSetsResponse{
			ExerciseSets: exerciseSets,
		},
	}, nil
}

func (h *exerciseHandler) GetPersonalBests(ctx context.Context, req *connect.Request[v1.GetPersonalBestsRequest]) (*connect.Response[v1.GetPersonalBestsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	personalBests, err := h.repo.ListPersonalBests(ctx, repo.ListPersonalBestsWithUserID(req.Msg.GetUserId()))
	if err != nil {
		log.Error("list personal bests failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exerciseIDs := make([]string, 0, len(personalBests))
	for _, pb := range personalBests {
		exerciseIDs = append(exerciseIDs, pb.ExerciseID.String)
	}

	exercises, err := h.repo.ListExercises(ctx, repo.ListExercisesWithIDs(exerciseIDs))
	if err != nil {
		log.Error("list exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pb, err := parsePersonalBestSliceToPB(personalBests, exercises)
	if err != nil {
		log.Error("failed to parse personal best slice to pb", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&v1.GetPersonalBestsResponse{
		PersonalBests: pb,
	}), nil
}

func (h *exerciseHandler) ListSets(ctx context.Context, req *connect.Request[v1.ListSetsRequest]) (*connect.Response[v1.ListSetsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	sets, err := h.repo.ListSets(ctx,
		repo.ListSetsWithLimit(limit+1),
		repo.ListSetsWithExerciseID(req.Msg.GetExerciseId()),
		repo.ListSetsWithPageToken(req.Msg.GetPagination().GetPageToken()),
	)
	if err != nil {
		log.Error("list sets failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(sets, limit, func(set *orm.Set) time.Time {
		return set.CreatedAt
	})
	if err != nil {
		log.Error("paginate sets failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	setSlice, err := parseSetSliceToPB(paginated.Items)
	if err != nil {
		log.Error("failed to parse set slice to pb", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("sets listed")
	return connect.NewResponse(&v1.ListSetsResponse{
		Sets: setSlice,
		Pagination: &v1.PaginationResponse{
			NextPageToken: paginated.NextPageToken,
		},
	}), nil
}
