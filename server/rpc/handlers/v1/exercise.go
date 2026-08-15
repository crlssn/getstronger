package v1

import (
	"context"
	"database/sql"
	"errors"
	"strings"
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

var _ apiv1connect.ExerciseServiceHandler = (*exerciseHandler)(nil)

const maxExerciseTags = 10

var (
	ErrInvalidExerciseTags   = errors.New("exercise tags must contain no more than 10 non-empty, trimmed, unique values")
	ErrInvalidExerciseMetric = errors.New("exercise must contain one or more unique measurements")
)

func normalizeExerciseMetrics(metrics []apiv1.ExerciseMetric) ([]string, error) {
	if len(metrics) == 0 {
		return []string{"weight", "reps"}, nil
	}

	normalized := make([]string, 0, len(metrics))
	seen := make(map[string]struct{}, len(metrics))
	for _, metric := range metrics {
		s, err := enumToString(metric)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		normalized = append(normalized, s)
	}
	if len(normalized) == 0 {
		return nil, ErrInvalidExerciseMetric
	}
	return normalized, nil
}

func enumToString(metric apiv1.ExerciseMetric) (string, error) {
	switch metric {
	case apiv1.ExerciseMetric_EXERCISE_METRIC_WEIGHT:
		return "weight", nil
	case apiv1.ExerciseMetric_EXERCISE_METRIC_REPS:
		return "reps", nil
	case apiv1.ExerciseMetric_EXERCISE_METRIC_DISTANCE:
		return "distance", nil
	case apiv1.ExerciseMetric_EXERCISE_METRIC_TIME:
		return "time", nil
	case apiv1.ExerciseMetric_EXERCISE_METRIC_UNSPECIFIED:
		return "", ErrInvalidExerciseMetric
	default:
		return "", ErrInvalidExerciseMetric
	}
}

func normalizeExerciseTags(tags []string) ([]string, error) {
	if len(tags) > maxExerciseTags {
		return nil, ErrInvalidExerciseTags
	}

	normalized := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		key := strings.ToLower(tag)
		if tag == "" {
			return nil, ErrInvalidExerciseTags
		}
		if _, duplicate := seen[key]; duplicate {
			return nil, ErrInvalidExerciseTags
		}
		seen[key] = struct{}{}
		normalized = append(normalized, tag)
	}

	return normalized, nil
}

type exerciseHandler struct {
	repo repo.Repo
}

func NewExerciseHandler(r repo.Repo) apiv1connect.ExerciseServiceHandler {
	return &exerciseHandler{r}
}

func (h *exerciseHandler) CreateExercise(ctx context.Context, req *connect.Request[apiv1.CreateExerciseRequest]) (*connect.Response[apiv1.CreateExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)
	tags, err := normalizeExerciseTags(req.Msg.GetTags())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	metrics, err := normalizeExerciseMetrics(req.Msg.GetMetrics())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	restSeconds := int(req.Msg.GetRestSeconds())
	if len(req.Msg.GetMetrics()) == 0 && restSeconds == 0 {
		restSeconds = 90
	}
	exercise, err := h.repo.CreateExercise(ctx, repo.CreateExerciseParams{
		UserID:      userID,
		Name:        req.Msg.GetName(),
		Tags:        tags,
		Metrics:     metrics,
		RestSeconds: restSeconds,
	})
	if err != nil {
		log.Error("create exercise failed", zap.Error(err))
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
			log.Warn("exercise not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
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
			log.Warn("exercise not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	var opts []repo.UpdateExerciseOpt
	for _, path := range req.Msg.GetUpdateMask().GetPaths() {
		opt, errOpt := h.pathToUpdateExerciseOpt(path, req.Msg.GetExercise())
		if errOpt != nil {
			log.With(zap.Error(errOpt)).Error("invalid path")
			continue
		}
		opts = append(opts, opt)
	}

	if err = h.repo.UpdateExercise(ctx, exercise.ID.String(), opts...); err != nil {
		log.Error("update exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercise, err = h.repo.GetExercise(ctx, repo.GetExerciseWithID(exercise.ID.String()))
	if err != nil {
		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise updated")
	return connect.NewResponse(&apiv1.UpdateExerciseResponse{
		Exercise: parser.Exercise(exercise),
	}), nil
}

func (h *exerciseHandler) pathToUpdateExerciseOpt(path string, exercise *apiv1.Exercise) (repo.UpdateExerciseOpt, error) {
	switch path {
	case "name":
		return repo.UpdateExerciseTitle(exercise.GetName()), nil
	case "tags":
		tags, err := normalizeExerciseTags(exercise.GetTags())
		if err != nil {
			return nil, err
		}
		return repo.UpdateExerciseTags(tags), nil
	case "metrics":
		metrics, err := normalizeExerciseMetrics(exercise.GetMetrics())
		if err != nil {
			return nil, err
		}
		return repo.UpdateExerciseMetrics(metrics), nil
	case "rest_seconds":
		return repo.UpdateExerciseRestSeconds(int(exercise.GetRestSeconds())), nil
	default:
		return nil, ErrInvalidUpdateMaskPath
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
			log.Warn("exercise not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err := h.repo.SoftDeleteExercise(ctx, repo.SoftDeleteExerciseParams{
		UserID:     userID,
		ExerciseID: req.Msg.GetId(),
	}); err != nil {
		log.Error("delete exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise deleted")
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
		log.Error("list exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(exercises, limit, func(exercise *models.Exercise) time.Time {
		return exercise.CreatedAt
	})
	if err != nil {
		log.Error("paginate exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercises listed")
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

		log.Error("failed to get previous workout sets", zap.Error(err))
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
		log.Error("list personal bests failed", zap.Error(err))
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
		log.Error("list sets failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(sets, limit, func(set *models.Set) time.Time {
		return set.CreatedAt
	})
	if err != nil {
		log.Error("paginate sets failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	userIDs := make([]string, 0, len(paginated.Items))
	for _, set := range paginated.Items {
		userIDs = append(userIDs, set.UserID.String())
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, userIDs...)
	if err != nil {
		log.Error("list personal bests failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("sets listed")
	return connect.NewResponse(&apiv1.ListSetsResponse{
		Sets: parser.SetSlice(paginated.Items, personalBests),
		Pagination: &apiv1.PaginationResponse{
			NextPageToken: paginated.NextPageToken,
		},
	}), nil
}
