package v1

import (
	"context"
	"database/sql"
	"errors"

	"connectrpc.com/connect"
	"github.com/volatiletech/null/v8"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repo"
	"github.com/crlssn/getstronger/go/pkg/xzap"
)

var _ apiv1connect.ExerciseServiceHandler = (*exerciseHandler)(nil)

type exerciseHandler struct {
	log  *zap.Logger
	repo *repo.Repo
}

func NewExerciseHandler(log *zap.Logger, repo *repo.Repo) apiv1connect.ExerciseServiceHandler {
	return &exerciseHandler{log, repo}
}

func (h *exerciseHandler) Create(ctx context.Context, req *connect.Request[v1.CreateExerciseRequest]) (*connect.Response[v1.CreateExerciseResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.ExerciseServiceCreateProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))

	var restBetweenSets int16
	if req.Msg.RestBetweenSets != nil {
		restBetweenSets = int16(req.Msg.RestBetweenSets.Seconds)
	}
	exercise, err := h.repo.CreateExercise(ctx, repo.CreateExerciseParams{
		UserID:          userID,
		Name:            req.Msg.Name,
		Label:           req.Msg.Label,
		RestBetweenSets: restBetweenSets,
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
	log := h.log.With(xzap.FieldRPC(apiv1connect.ExerciseServiceGetProcedure))
	log.Info("request received")

	exercise, err := h.repo.FindExercise(ctx, req.Msg.Id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Error("exercise not found", zap.String("id", req.Msg.Id))
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return connect.NewResponse(&v1.GetExerciseResponse{
		Exercise: parseExerciseToPB(exercise),
	}), nil
}

func (h *exerciseHandler) Update(ctx context.Context, req *connect.Request[v1.UpdateExerciseRequest]) (*connect.Response[v1.UpdateExerciseResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.ExerciseServiceUpdateProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))

	exercise, err := h.repo.FindExercise(ctx, req.Msg.Exercise.Id)
	if err != nil {
		log.Error("find exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if exercise.UserID != userID {
		log.Error("exercise does not belong to user")
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	for _, path := range req.Msg.UpdateMask.Paths {
		switch path {
		case "name":
			exercise.Title = req.Msg.Exercise.Name
		case "label":
			exercise.SubTitle = null.NewString(req.Msg.Exercise.Label, req.Msg.Exercise.Label != "")
		case "rest_between_sets":
			exercise.RestBetweenSets = null.NewInt16(0, false)
			if req.Msg.Exercise.RestBetweenSets != nil {
				exercise.RestBetweenSets = null.NewInt16(int16(req.Msg.Exercise.RestBetweenSets.Seconds), req.Msg.Exercise.RestBetweenSets.Seconds > 0)
			}
		default:
			log.Error("invalid update mask path", zap.String("path", path))
			return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid update mask path"))
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
	log := h.log.With(xzap.FieldRPC(apiv1connect.ExerciseServiceDeleteProcedure))
	log.Info("request received")

	userID, ok := ctx.Value(jwt.ContextKeyUserID).(string)
	if !ok {
		log.Error("user ID not provided")
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("user ID not provided"))
	}
	log = log.With(xzap.FieldUserID(userID))

	if err := h.repo.SoftDeleteExercise(ctx, repo.SoftDeleteExerciseParams{
		UserID:     userID,
		ExerciseID: req.Msg.Id,
	}); err != nil {
		log.Error("delete exercise failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercise deleted")
	return connect.NewResponse(&v1.DeleteExerciseResponse{}), nil
}

func (h *exerciseHandler) List(ctx context.Context, req *connect.Request[v1.ListExercisesRequest]) (*connect.Response[v1.ListExercisesResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.ExerciseServiceListProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))

	exercises, nextPageToken, err := h.repo.ListExercises(ctx, repo.ListExercisesParams{
		UserID:    userID,
		Name:      null.NewString(req.Msg.Name, req.Msg.Name != ""),
		Limit:     20,
		PageToken: req.Msg.PageToken,
	})
	if err != nil {
		log.Error("list exercises failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("exercises listed", zap.Any("exercises", exercises))
	return connect.NewResponse(&v1.ListExercisesResponse{
		Exercises:     parseExerciseSliceToPB(exercises),
		NextPageToken: nextPageToken,
	}), nil
}
