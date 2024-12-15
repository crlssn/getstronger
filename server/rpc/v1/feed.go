package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

var _ apiv1connect.FeedServiceHandler = (*feedHandler)(nil)

type feedHandler struct {
	repo repo.Repo
}

func NewFeedHandler(r repo.Repo) apiv1connect.FeedServiceHandler {
	return &feedHandler{r}
}

func (h *feedHandler) ListFeedItems(ctx context.Context, req *connect.Request[v1.ListFeedItemsRequest]) (*connect.Response[v1.ListFeedItemsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	opts := []repo.ListWorkoutsOpt{
		repo.ListWorkoutsWithSets(),
		repo.ListWorkoutsWithUser(),
		repo.ListWorkoutsWithLimit(limit + 1),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPagination().GetPageToken()),
	}

	if req.Msg.GetFollowedOnly() {
		followers, err := h.repo.ListFollowers(ctx, userID)
		if err != nil {
			log.Error("failed to list followers", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		followerIDs := make([]string, 0, len(followers))
		for _, follower := range followers {
			followerIDs = append(followerIDs, follower.ID)
		}

		opts = append(opts, repo.ListWorkoutsWithUserIDs(append(followerIDs, userID)...))
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

	var exerciseIDs []string
	for _, workout := range paginated.Items {
		for _, set := range workout.R.Sets {
			exerciseIDs = append(exerciseIDs, set.ExerciseID)
		}
	}

	exercises, err := h.repo.ListExercises(ctx, repo.ListExercisesWithIDs(exerciseIDs))
	if err != nil {
		log.Error("failed to list exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	feedItems, err := parseFeedItemsToPB(paginated.Items, exercises)
	if err != nil {
		log.Error("failed to parse feed items", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.ListFeedItemsResponse]{
		Msg: &v1.ListFeedItemsResponse{
			Items: feedItems,
			Pagination: &v1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}
