package v1

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/account"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
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

	viewer, err := h.repo.GetUser(ctx, repo.GetUserWithID(userID))
	if err != nil {
		log.Error("Get viewer for feed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

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

	paginated, err := repo.PaginateSlice(workouts, limit, func(workout *training.Workout) (time.Time, uuid.UUID) {
		return workout.CreatedAt, workout.ID
	})
	if err != nil {
		log.Error("Paginate feed workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := h.personalBestsOf(ctx, paginated.Items)
	if err != nil {
		log.Error("Get personal bests for feed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListFeedItemsResponse]{
		Msg: &apiv1.ListFeedItemsResponse{
			Items: parser.FeedItemSlice(paginated.Items, personalBests),
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
			SeenAt: feedSeenAt(viewer),
		},
	}, nil
}

// personalBestsOf is every personal best held by the owners of the workouts,
// so the feed can mark the sets that set one.
func (h *feedHandler) personalBestsOf(ctx context.Context, workouts []*training.Workout) ([]*training.Set, error) {
	ownerIDs := make(map[uuid.UUID]struct{}, len(workouts))
	for _, workout := range workouts {
		ownerIDs[workout.UserID] = struct{}{}
	}

	ids := make([]uuid.UUID, 0, len(ownerIDs))
	for id := range ownerIDs {
		ids = append(ids, id)
	}

	bests, err := h.repo.GetPersonalBests(ctx, ids...)
	if err != nil {
		return nil, fmt.Errorf("personal bests get: %w", err)
	}

	return bests, nil
}

// feedSeenAt is where the feed draws its line for the viewer, or nil for one
// who has never seen it: with no line to draw, a client highlights nothing
// rather than everything.
func feedSeenAt(viewer *account.User) *timestamppb.Timestamp {
	if viewer.FeedSeenAt.IsZero() {
		return nil
	}

	return timestamppb.New(viewer.FeedSeenAt)
}

func (h *feedHandler) MarkFeedAsSeen(ctx context.Context, _ *connect.Request[apiv1.MarkFeedAsSeenRequest]) (*connect.Response[apiv1.MarkFeedAsSeenResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.MarkFeedAsSeen(ctx, userID); err != nil {
		log.Error("Mark feed as seen", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.MarkFeedAsSeenResponse]{}, nil
}
