package v1

import (
	"context"
	"encoding/json"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
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

	return &connect.Response[v1.FinishWorkoutResponse]{}, nil
}

func (h *workoutHandler) List(ctx context.Context, req *connect.Request[v1.ListWorkoutsRequest]) (*connect.Response[v1.ListWorkoutsResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.WorkoutServiceListProcedure))
	log.Info("request received")

	userID := jwt.MustExtractUserID(ctx)
	log = log.With(xzap.FieldUserID(userID))

	limit := int(req.Msg.GetPageSize())
	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsWithLimit(limit+1),
		repo.ListWorkoutsWithUserID(userID),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPageToken()),
	)
	if err != nil {
		log.Error("failed to list workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	//var nextPageToken []byte
	//if len(workouts) > limit {
	//	workouts = workouts[:limit]
	//	if nextPageToken, err = json.Marshal(repo.PageToken{
	//		CreatedAt: workouts[len(workouts)-1].CreatedAt,
	//	}); err != nil {
	//		log.Error("marshal page token failed", zap.Error(err))
	//		return nil, connect.NewError(connect.CodeInternal, nil)
	//	}
	//}

	workouts, nextPageToken, err := repo.PaginateSlice(workouts, limit, func(workouts orm.WorkoutSlice) time.Time {
		return workouts[0].CreatedAt
	})

	workoutsPB, err := parseWorkoutsToPB(workouts)

	return &connect.Response[v1.ListWorkoutsResponse]{
		Msg: &v1.ListWorkoutsResponse{
			Workouts:      workoutsPB,
			NextPageToken: nextPageToken,
		},
	}, nil
}
