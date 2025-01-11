package v1

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/davecgh/go-spew/spew"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
	"github.com/crlssn/getstronger/server/xzap"
)

var _ apiv1connect.ExerciseServiceHandler = (*exerciseHandler)(nil)

type exerciseHandler struct {
	repo repo.Repo
}

func NewExerciseHandler(r repo.Repo) apiv1connect.ExerciseServiceHandler {
	return &exerciseHandler{r}
}

func (h *exerciseHandler) CreateExercise(ctx context.Context, req *connect.Request[apiv1.CreateExerciseRequest]) (*connect.Response[apiv1.CreateExerciseResponse], error) {
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

	return connect.NewResponse(&apiv1.CreateExerciseResponse{
		Id: exercise.ID,
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

var errInvalidUpdateMaskPath = errors.New("invalid update mask path")

func (h *exerciseHandler) UpdateExercise(ctx context.Context, req *connect.Request[apiv1.UpdateExerciseRequest]) (*connect.Response[apiv1.UpdateExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx).
		With(xzap.FieldExerciseID(req.Msg.GetExercise().GetId()))
	userID := xcontext.MustExtractUserID(ctx)
	spew.Dump(req.Msg)

	exercise, err := h.repo.GetExercise(ctx,
		repo.GetExerciseWithID(req.Msg.GetExercise().GetId()),
		repo.GetExerciseWithUserID(userID),
	)
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
		switch path {
		case "name":
			opts = append(opts, repo.UpdateExerciseTitle(req.Msg.GetExercise().GetName()))
		case "label":
			opts = append(opts, repo.UpdateExerciseSubTitle(req.Msg.GetExercise().GetLabel()))
		default:
			log.Error("invalid update mask path", zap.String("path", path))
			return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidUpdateMaskPath)
		}
	}

	if err = h.repo.UpdateExercise(ctx, exercise.ID, opts...); err != nil {
		log.Error("update exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercise, err = h.repo.GetExercise(ctx, repo.GetExerciseWithID(exercise.ID))
	if err != nil {
		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise updated")
	return connect.NewResponse(&apiv1.UpdateExerciseResponse{
		Exercise: parser.Exercise(exercise),
	}), nil
}

func (h *exerciseHandler) DeleteExercise(ctx context.Context, req *connect.Request[apiv1.DeleteExerciseRequest]) (*connect.Response[apiv1.DeleteExerciseResponse], error) {
	log := xcontext.MustExtractLogger(ctx).
		With(xzap.FieldExerciseID(req.Msg.GetId()))
	userID := xcontext.MustExtractUserID(ctx)

	if _, err := h.repo.GetExercise(ctx,
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
	exercises, err := h.repo.ListExercises(ctx,
		repo.ListExercisesWithIDs(req.Msg.GetExerciseIds()),
		repo.ListExercisesWithName(req.Msg.GetName()),
		repo.ListExercisesWithLimit(limit+1),
		repo.ListExercisesWithUserID(userID),
		repo.ListExercisesWithPageToken(req.Msg.GetPagination().GetPageToken()),
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
	sets, err := h.repo.ListSets(ctx,
		repo.ListSetsWithLimit(limit+1),
		repo.ListSetsWithUserID(req.Msg.GetUserIds()...),
		repo.ListSetsWithExerciseID(req.Msg.GetExerciseIds()...),
		repo.ListSetsWithPageToken(req.Msg.GetPagination().GetPageToken()),
		repo.ListSetsOrderByCreatedAt(repo.DESC),
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

	userIDs := make([]string, 0, len(paginated.Items))
	for _, set := range paginated.Items {
		userIDs = append(userIDs, set.UserID)
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
