package v1

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/volatiletech/null/v8"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
	"github.com/crlssn/getstronger/apps/backend/pkg/xcontext"
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
	userID := xcontext.MustExtractUserID(ctx)

	exercise, err := h.repo.GetExercise(ctx, repo.GetExerciseWithID(req.Msg.GetId()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Error("exercise not found", zap.String("id", req.Msg.GetId()))
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if exercise.UserID != userID {
		log.Error("exercise does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
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
		Exercises:     parseExercisesToPB(pagination.Items),
		NextPageToken: pagination.NextPageToken,
	}), nil
}
