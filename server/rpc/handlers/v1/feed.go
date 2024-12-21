package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.FeedServiceHandler = (*feedHandler)(nil)

type feedHandler struct {
	repo repo.Repo
}

func NewFeedHandler(r repo.Repo) apiv1connect.FeedServiceHandler {
	return &feedHandler{r}
}

func (h *feedHandler) ListFeedItems(ctx context.Context, req *connect.Request[apiv1.ListFeedItemsRequest]) (*connect.Response[apiv1.ListFeedItemsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	opts := []repo.ListWorkoutsOpt{
		repo.ListWorkoutsLoadSets(),
		repo.ListWorkoutsLoadUser(),
		repo.ListWorkoutsLoadComments(),
		repo.ListWorkoutsLoadExercises(),
		repo.ListWorkoutsWithLimit(limit + 1),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPagination().GetPageToken()),
	}

	if req.Msg.GetFollowedOnly() {
		followees, err := h.repo.ListFollowees(ctx, userID)
		if err != nil {
			log.Error("failed to list followees", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		followeeIDs := make([]string, 0, len(followees))
		for _, follower := range followees {
			followeeIDs = append(followeeIDs, follower.ID)
		}

		opts = append(opts, repo.ListWorkoutsWithUserIDs(append(followeeIDs, userID)...))
	}

	workouts, err := h.repo.ListWorkouts(ctx, opts...)
	if err != nil {
		log.Error("failed to list workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(workouts, limit, func(workout *orm.Workout) time.Time {
		return workout.CreatedAt
	})
	if err != nil {
		log.Error("failed to paginate workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, userID)
	if err != nil {
		log.Error("failed to get personal bests", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	feedItems, err := parser.FeedItemSlice(paginated.Items, personalBests)
	if err != nil {
		log.Error("failed to parse feed items", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListFeedItemsResponse]{
		Msg: &apiv1.ListFeedItemsResponse{
			Items: feedItems,
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}
