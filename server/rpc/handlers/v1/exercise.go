package v1

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
	"github.com/crlssn/getstronger/server/xzap"
)

var _ apiv1connect.ExerciseServiceHandler = (*exerciseHandler)(nil)

type exerciseHandler struct {
	repo *repo.Repo
}

func NewExerciseHandler(r *repo.Repo) apiv1connect.ExerciseServiceHandler {
	return &exerciseHandler{r}
}

func (h *exerciseHandler) CreateExercise(ctx context.Context, req *connect.Request[apiv1.CreateExerciseRequest]) (*connect.Response[apiv1.CreateExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)
	tags, err := training.NormalizeExerciseTags(req.Msg.GetTags())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	metrics, err := training.NormalizeMetrics(parser.ExerciseMetricsFromProto(req.Msg.GetMetrics()))
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	exercise, err := h.repo.CreateExercise(ctx, repo.CreateExerciseParams{
		UserID:  userID,
		Name:    req.Msg.GetName(),
		Tags:    tags,
		Metrics: training.MetricStrings(metrics),
	})
	if err != nil {
		log.Error("Create exercise", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.CreateExerciseResponse{
		Id: exercise.ID.String(),
	}), nil
}

func (h *exerciseHandler) GetExercise(ctx context.Context, req *connect.Request[apiv1.GetExerciseRequest]) (*connect.Response[apiv1.GetExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx).With(xzap.FieldExerciseID(req.Msg.GetId()))

	exercise, err := h.repo.GetExercise(ctx, repo.GetExerciseWithID(req.Msg.GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Exercise not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("Get exercise by ID", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.GetExerciseResponse{
		Exercise: parser.Exercise(exercise),
	}), nil
}

var ErrInvalidUpdateMaskPath = errors.New("invalid update mask path")

func (h *exerciseHandler) UpdateExercise(ctx context.Context, req *connect.Request[apiv1.UpdateExerciseRequest]) (*connect.Response[apiv1.UpdateExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx).
		With(xzap.FieldExerciseID(req.Msg.GetExercise().GetId()))
	userID := xcontext.MustExtractUserID(ctx)

	exercise, err := h.repo.GetExercise(ctx,
		repo.GetExerciseWithID(req.Msg.GetExercise().GetId()),
		repo.GetExerciseWithUserID(userID))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Exercise not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find exercise for update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	locked, err := h.metricsLocked(ctx, log, exercise, req.Msg)
	if err != nil {
		return nil, err
	}
	if locked {
		log.Warn("Exercise measurements locked by logged sets")
		return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
	}

	var opts []repo.UpdateExerciseOpt
	for _, path := range req.Msg.GetUpdateMask().GetPaths() {
		opt, errOpt := h.pathToUpdateExerciseOpt(path, req.Msg.GetExercise())
		if errOpt != nil {
			return nil, errOpt
		}
		opts = append(opts, opt)
	}

	if err = h.repo.UpdateExercise(ctx, exercise.ID.String(), opts...); err != nil {
		log.Error("Update exercise", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercise, err = h.repo.GetExercise(ctx, repo.GetExerciseWithID(exercise.ID.String()))
	if err != nil {
		log.Error("Get exercise after update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Exercise updated")
	return connect.NewResponse(&apiv1.UpdateExerciseResponse{
		Exercise: parser.Exercise(exercise),
	}), nil
}

// metricsLocked asks the training context whether the update may change what
// the exercise measures. It answers false for an update that leaves the
// measurements alone, so the whole-message updates the web client sends keep
// working, and it runs the "has it been logged" query the rule needs rather
// than letting the domain reach for a store.
func (h *exerciseHandler) metricsLocked(ctx context.Context, log *zap.Logger, exercise *models.Exercise, msg *apiv1.UpdateExerciseRequest) (bool, error) {
	if !slices.Contains(msg.GetUpdateMask().GetPaths(), "metrics") {
		return false, nil
	}

	requested, err := training.NormalizeMetrics(parser.ExerciseMetricsFromProto(msg.GetExercise().GetMetrics()))
	if err != nil {
		return false, connect.NewError(connect.CodeInvalidArgument, err)
	}

	sets, err := h.repo.CountSets(ctx, repo.CountSetsWithExerciseID(exercise.ID.String()))
	if err != nil {
		log.Error("Count sets for exercise measurement change", zap.Error(err))
		return false, connect.NewError(connect.CodeInternal, nil)
	}

	return training.MetricsLocked(training.MetricsFromStrings(exercise.Metrics), requested, sets > 0), nil
}

func (h *exerciseHandler) pathToUpdateExerciseOpt(path string, exercise *apiv1.Exercise) (repo.UpdateExerciseOpt, error) {
	switch path {
	case "name":
		return repo.UpdateExerciseTitle(exercise.GetName()), nil
	case "tags":
		tags, err := training.NormalizeExerciseTags(exercise.GetTags())
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		return repo.UpdateExerciseTags(tags), nil
	case "metrics":
		metrics, err := training.NormalizeMetrics(parser.ExerciseMetricsFromProto(exercise.GetMetrics()))
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		return repo.UpdateExerciseMetrics(training.MetricStrings(metrics)), nil
	default:
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidUpdateMaskPath)
	}
}

func (h *exerciseHandler) DeleteExercise(ctx context.Context, req *connect.Request[apiv1.DeleteExerciseRequest]) (*connect.Response[apiv1.DeleteExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx).
		With(xzap.FieldExerciseID(req.Msg.GetId()))
	userID := xcontext.MustExtractUserID(ctx)

	if _, err := h.repo.GetExercise(
		ctx,
		repo.GetExerciseWithID(req.Msg.GetId()),
		repo.GetExerciseWithUserID(userID),
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Exercise not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Find exercise for deletion", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err := h.repo.SoftDeleteExercise(ctx, repo.SoftDeleteExerciseParams{
		UserID:     userID,
		ExerciseID: req.Msg.GetId(),
	}); err != nil {
		log.Error("Delete exercise", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Exercise deleted")
	return connect.NewResponse(&apiv1.DeleteExerciseResponse{}), nil
}

func (h *exerciseHandler) ListExercises(ctx context.Context, req *connect.Request[apiv1.ListExercisesRequest]) (*connect.Response[apiv1.ListExercisesResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())

	opts := []repo.ListExercisesOpt{
		repo.ListExercisesWithLimit(limit + 1),
		repo.ListExercisesWithUserID(userID),
		repo.ListExercisesWithPageToken(req.Msg.GetPagination().GetPageToken()),
		repo.ListExercisesWithoutDeleted(),
	}

	if req.Msg.GetName() != "" {
		opts = append(opts, repo.ListExercisesWithName(req.Msg.GetName()))
	}

	if req.Msg.GetExerciseIds() != nil {
		opts = append(opts, repo.ListExercisesWithIDs(req.Msg.GetExerciseIds()))
	}

	exercises, err := h.repo.ListExercises(ctx, opts...)
	if err != nil {
		log.Error("List exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(exercises, limit, func(exercise *models.Exercise) (time.Time, string) {
		return exercise.CreatedAt, exercise.ID.String()
	})
	if err != nil {
		log.Error("Paginate exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Exercises listed")
	return connect.NewResponse(&apiv1.ListExercisesResponse{
		Exercises: parser.ExerciseSlice(pagination.Items),
		Pagination: &apiv1.PaginationResponse{
			NextPageToken: pagination.NextPageToken,
		},
	}), nil
}

func (h *exerciseHandler) GetPreviousWorkoutSets(ctx context.Context, req *connect.Request[apiv1.GetPreviousWorkoutSetsRequest]) (*connect.Response[apiv1.GetPreviousWorkoutSetsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	sets, err := h.repo.GetPreviousWorkoutSets(ctx, req.Msg.GetExerciseIds())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &connect.Response[apiv1.GetPreviousWorkoutSetsResponse]{
				Msg: &apiv1.GetPreviousWorkoutSetsResponse{
					ExerciseSets: nil,
				},
			}, nil
		}

		log.Error("Get previous workout sets", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.GetPreviousWorkoutSetsResponse]{
		Msg: &apiv1.GetPreviousWorkoutSetsResponse{
			ExerciseSets: parser.ExerciseSetsSlice(sets),
		},
	}, nil
}

func (h *exerciseHandler) GetPersonalBests(ctx context.Context, req *connect.Request[apiv1.GetPersonalBestsRequest]) (*connect.Response[apiv1.GetPersonalBestsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	personalBests, err := h.repo.GetPersonalBests(ctx, req.Msg.GetUserId())
	if err != nil {
		log.Error("List personal bests for exercise", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&apiv1.GetPersonalBestsResponse{
		PersonalBests: parser.ExerciseSetSlice(personalBests),
	}), nil
}

func (h *exerciseHandler) ListSets(ctx context.Context, req *connect.Request[apiv1.ListSetsRequest]) (*connect.Response[apiv1.ListSetsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	opts := []repo.ListSetsOpt{
		repo.ListSetsWithLimit(limit + 1),
		repo.ListSetsWithPageToken(req.Msg.GetPagination().GetPageToken()),
		repo.ListSetsOrderByCreatedAt(repo.DESC),
	}

	if req.Msg.GetExerciseIds() != nil {
		opts = append(opts, repo.ListSetsWithExerciseID(req.Msg.GetExerciseIds()...))
	}

	if req.Msg.GetUserIds() != nil {
		opts = append(opts, repo.ListSetsWithUserID(req.Msg.GetUserIds()...))
	}

	sets, err := h.repo.ListSets(ctx, opts...)
	if err != nil {
		log.Error("List sets for exercise", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(sets, limit, func(set *models.Set) (time.Time, string) {
		return set.CreatedAt, set.ID.String()
	})
	if err != nil {
		log.Error("Paginate exercise sets", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	userIDs := make([]string, 0, len(paginated.Items))
	for _, set := range paginated.Items {
		userIDs = append(userIDs, set.UserID.String())
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, userIDs...)
	if err != nil {
		log.Error("List personal bests for exercise sets", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Sets listed")
	return connect.NewResponse(&apiv1.ListSetsResponse{
		Sets: parser.SetSlice(paginated.Items, personalBests),
		Pagination: &apiv1.PaginationResponse{
			NextPageToken: paginated.NextPageToken,
		},
	}), nil
}
