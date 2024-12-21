package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.UserServiceHandler = (*userHandler)(nil)

type userHandler struct {
	repo   repo.Repo
	pubSub *pubsub.PubSub
}

func NewUserHandler(r repo.Repo, ps *pubsub.PubSub) apiv1connect.UserServiceHandler {
	return &userHandler{r, ps}
}

func (h *userHandler) GetUser(ctx context.Context, req *connect.Request[apiv1.GetUserRequest]) (*connect.Response[apiv1.GetUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	user, err := h.repo.GetUser(ctx,
		repo.GetUserWithID(req.Msg.GetId()),
		repo.GetUserLoadAuth(),
	)
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followed, err := h.repo.IsUserFollowedByUserID(ctx, user, userID)
	if err != nil {
		log.Error("failed to check if user is followed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.GetUserResponse]{
		Msg: &apiv1.GetUserResponse{
			User: parser.User(user,
				parser.UserEmail(user.R.GetAuth()),
				parser.UserFollowed(followed),
			),
		},
	}, nil
}

func (h *userHandler) SearchUsers(ctx context.Context, req *connect.Request[apiv1.SearchUsersRequest]) (*connect.Response[apiv1.SearchUsersResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	users, err := h.repo.ListUsers(ctx,
		repo.ListUsersWithLimit(limit+1),
		repo.ListUsersWithNameMatching(req.Msg.GetQuery()),
	)
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(users, limit, func(user *orm.User) time.Time {
		return user.CreatedAt
	})
	if err != nil {
		log.Error("failed to paginate users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("searched users")
	return &connect.Response[apiv1.SearchUsersResponse]{
		Msg: &apiv1.SearchUsersResponse{
			Users: parser.UsersToPB(pagination.Items),
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: pagination.NextPageToken,
			},
		},
	}, nil
}

func (h *userHandler) FollowUser(ctx context.Context, req *connect.Request[apiv1.FollowUserRequest]) (*connect.Response[apiv1.FollowUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.Follow(ctx, repo.FollowParams{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
	}); err != nil {
		log.Error("failed to follow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	h.pubSub.Publish(ctx, orm.EventTopicFollowedUser, payloads.UserFollowed{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
	})

	return &connect.Response[apiv1.FollowUserResponse]{
		Msg: &apiv1.FollowUserResponse{},
	}, nil
}

func (h *userHandler) UnfollowUser(ctx context.Context, req *connect.Request[apiv1.UnfollowUserRequest]) (*connect.Response[apiv1.UnfollowUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.Unfollow(ctx, repo.UnfollowParams{
		FollowerID: userID,
		FolloweeID: req.Msg.GetUnfollowId(),
	}); err != nil {
		log.Error("failed to unfollow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.UnfollowUserResponse]{
		Msg: &apiv1.UnfollowUserResponse{},
	}, nil
}

func (h *userHandler) ListFollowers(ctx context.Context, req *connect.Request[apiv1.ListFollowersRequest]) (*connect.Response[apiv1.ListFollowersResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	followers, err := h.repo.ListFollowers(ctx, req.Msg.GetFollowerId())
	if err != nil {
		log.Error("failed to get followers", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListFollowersResponse]{
		Msg: &apiv1.ListFollowersResponse{
			Followers: parser.UsersToPB(followers),
		},
	}, nil
}

func (h *userHandler) ListFollowees(ctx context.Context, req *connect.Request[apiv1.ListFolloweesRequest]) (*connect.Response[apiv1.ListFolloweesResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	followees, err := h.repo.ListFollowees(ctx, req.Msg.GetFolloweeId())
	if err != nil {
		log.Error("failed to get followees", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListFolloweesResponse]{
		Msg: &apiv1.ListFolloweesResponse{
			Followees: parser.UsersToPB(followees),
		},
	}, nil
}
