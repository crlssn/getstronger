package v1

import (
	"context"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
	"github.com/crlssn/getstronger/apps/backend/pkg/xzap"
)

var _ apiv1connect.WorkoutServiceHandler = (*workoutHandler)(nil)

type workoutHandler struct {
	log  *zap.Logger
	repo *repo.Repo
}

func NewWorkoutHandler(log *zap.Logger, r *repo.Repo) apiv1connect.WorkoutServiceHandler {
	return &workoutHandler{log, r}
}

func (h *workoutHandler) Finish(ctx context.Context, req *connect.Request[v1.FinishWorkoutRequest]) (*connect.Response[v1.FinishWorkoutResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.WorkoutServiceFinishProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))
}

func (h *workoutHandler) List(ctx context.Context, req *connect.Request[v1.ListWorkoutsRequest]) (*connect.Response[v1.ListWorkoutsResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.WorkoutServiceListProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))
}
