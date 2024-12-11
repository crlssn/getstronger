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
	repo *repo.Repo
}

func NewFeedHandler(r *repo.Repo) apiv1connect.FeedServiceHandler {
	return &feedHandler{r}
}

func (h *feedHandler) ListItems(ctx context.Context, req *connect.Request[v1.ListItemsRequest]) (*connect.Response[v1.ListItemsResponse], error) { //nolint:cyclop // TODO: Simplify this method.
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(userID))
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followers, err := h.repo.ListFollowers(ctx, user)
	if err != nil {
		log.Error("failed to list followers", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followerIDs := make([]string, 0, len(followers))
	for _, follower := range followers {
		followerIDs = append(followerIDs, follower.ID)
	}

	limit := int(req.Msg.GetPagination().GetPageLimit())
	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsWithSets(),
		repo.ListWorkoutsWithLimit(limit+1),
		repo.ListWorkoutsWithUserIDs(append(followerIDs, userID)),
		repo.ListWorkoutsWithComments(),
		repo.ListWorkoutsWithPageToken(req.Msg.GetPagination().GetPageToken()),
	)
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

	var userIDs []string
	var exerciseIDs []string
	for _, workout := range paginated.Items {
		for _, set := range workout.R.Sets {
			exerciseIDs = append(exerciseIDs, set.ExerciseID)
		}
		for _, comment := range workout.R.WorkoutComments {
			userIDs = append(userIDs, comment.UserID)
		}
	}

	users, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(userIDs))
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	exercises, err := h.repo.ListExercises(ctx, repo.ListExercisesWithIDs(exerciseIDs))
	if err != nil {
		log.Error("failed to list exercises", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	feedItems, err := parseFeedItemsToPB(paginated.Items, users, exercises)
	if err != nil {
		log.Error("failed to parse feed items", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.ListItemsResponse]{
		Msg: &v1.ListItemsResponse{
			Items: feedItems,
			Pagination: &v1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}
