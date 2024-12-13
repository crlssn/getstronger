package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/bus/events"
	"github.com/crlssn/getstronger/server/bus/payloads"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

var _ apiv1connect.UserServiceHandler = (*userHandler)(nil)

type userHandler struct {
	bus  *bus.Bus
	repo *repo.Repo
}

func NewUserHandler(b *bus.Bus, r *repo.Repo) apiv1connect.UserServiceHandler {
	return &userHandler{b, r}
}

func (h *userHandler) GetUser(ctx context.Context, req *connect.Request[v1.GetUserRequest]) (*connect.Response[v1.GetUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(req.Msg.GetId()))
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	auth, err := h.repo.GetAuth(ctx, repo.GetAuthByID(user.ID))
	if err != nil {
		log.Error("failed to get auth", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followed, err := h.repo.IsUserFollowedByUserID(ctx, user, userID)
	if err != nil {
		log.Error("failed to check if user is followed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	// DEBT: Move email to user model.
	u := parseUserToPB(user, followed)
	u.Email = auth.Email

	return &connect.Response[v1.GetUserResponse]{
		Msg: &v1.GetUserResponse{
			User: u,
		},
	}, nil
}

func (h *userHandler) SearchUsers(ctx context.Context, req *connect.Request[v1.SearchUsersRequest]) (*connect.Response[v1.SearchUsersResponse], error) {
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
	return &connect.Response[v1.SearchUsersResponse]{
		Msg: &v1.SearchUsersResponse{
			Users: parseUserSliceToPB(pagination.Items),
			Pagination: &v1.PaginationResponse{
				NextPageToken: pagination.NextPageToken,
			},
		},
	}, nil
}

func (h *userHandler) FollowUser(ctx context.Context, req *connect.Request[v1.FollowUserRequest]) (*connect.Response[v1.FollowUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.Follow(ctx, repo.FollowParams{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
	}); err != nil {
		log.Error("failed to follow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err := h.bus.Publish(events.UserFollowed, &payloads.UserFollowed{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
	}); err != nil {
		log.Error("failed to publish user followed event", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.FollowUserResponse]{
		Msg: &v1.FollowUserResponse{},
	}, nil
}

func (h *userHandler) UnfollowUser(ctx context.Context, req *connect.Request[v1.UnfollowUserRequest]) (*connect.Response[v1.UnfollowUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.Unfollow(ctx, repo.UnfollowParams{
		FollowerID: userID,
		FolloweeID: req.Msg.GetUnfollowId(),
	}); err != nil {
		log.Error("failed to unfollow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.UnfollowUserResponse]{
		Msg: &v1.UnfollowUserResponse{},
	}, nil
}

func (h *userHandler) ListFollowers(ctx context.Context, req *connect.Request[v1.ListFollowersRequest]) (*connect.Response[v1.ListFollowersResponse], error) { //nolint:dupl
	log := xcontext.MustExtractLogger(ctx)

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(req.Msg.GetFollowerId()))
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followers, err := h.repo.ListFollowers(ctx, user)
	if err != nil {
		log.Error("failed to get followers", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.ListFollowersResponse]{
		Msg: &v1.ListFollowersResponse{
			Followers: parseUserSliceToPB(followers),
		},
	}, nil
}

func (h *userHandler) ListFollowees(ctx context.Context, req *connect.Request[v1.ListFolloweesRequest]) (*connect.Response[v1.ListFolloweesResponse], error) { //nolint:dupl
	log := xcontext.MustExtractLogger(ctx)

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(req.Msg.GetFolloweeId()))
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followees, err := h.repo.ListFollowees(ctx, user)
	if err != nil {
		log.Error("failed to get followees", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.ListFolloweesResponse]{
		Msg: &v1.ListFolloweesResponse{
			Followees: parseUserSliceToPB(followees),
		},
	}, nil
}
