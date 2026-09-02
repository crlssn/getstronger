package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.FeedServiceHandler = (*feedHandler)(nil)

type feedHandler struct {
	repo *repo.Repo
}

func NewFeedHandler(r *repo.Repo) apiv1connect.FeedServiceHandler {
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
			log.Error("List followees for feed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		followeeIDs := make([]uuid.UUID, 0, len(followees))
		for _, follower := range followees {
			followeeIDs = append(followeeIDs, follower.ID)
		}

		opts = append(opts, repo.ListWorkoutsWithUserIDs(append(followeeIDs, userID)...))
	}

	workouts, err := h.repo.ListWorkouts(ctx, opts...)
	if err != nil {
		log.Error("List workouts for feed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(workouts, limit, func(workout *models.Workout) (time.Time, uuid.UUID) {
		return workout.CreatedAt, workout.ID
	})
	if err != nil {
		log.Error("Paginate feed workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workoutUserIDs := make(map[uuid.UUID]struct{}, len(paginated.Items))
	for _, workout := range paginated.Items {
		workoutUserIDs[workout.UserID] = struct{}{}
	}

	personalBestUserIDs := make([]uuid.UUID, 0, len(workoutUserIDs))
	for id := range workoutUserIDs {
		personalBestUserIDs = append(personalBestUserIDs, id)
	}

	personalBests, err := h.repo.GetPersonalBests(ctx, personalBestUserIDs...)
	if err != nil {
		log.Error("Get personal bests for feed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	feedItems := parser.FeedItemSlice(paginated.Items, personalBests)

	return &connect.Response[apiv1.ListFeedItemsResponse]{
		Msg: &apiv1.ListFeedItemsResponse{
			Items: feedItems,
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}
