package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

var _ apiv1connect.UserServiceHandler = (*userHandler)(nil)

type userHandler struct {
	repo *repo.Repo
}

func (h *userHandler) Search(ctx context.Context, req *connect.Request[v1.SearchRequest]) (*connect.Response[v1.SearchResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	count, err := h.repo.CountUsers(ctx, repo.CountUsersWithNameMatching(req.Msg.GetQuery()))
	if err != nil {
		log.Error("failed to count users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

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
	return &connect.Response[v1.SearchResponse]{
		Msg: &v1.SearchResponse{
			Users: parseUserSliceToPB(pagination.Items),
			Pagination: &v1.PaginationResponse{
				TotalResults:  count,
				NextPageToken: pagination.NextPageToken,
			},
		},
	}, nil
}

func NewUserHandler(r *repo.Repo) apiv1connect.UserServiceHandler {
	return &userHandler{r}
}

func (h *userHandler) Follow(ctx context.Context, req *connect.Request[v1.FollowRequest]) (*connect.Response[v1.FollowResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.Follow(ctx, repo.FollowParams{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
	}); err != nil {
		log.Error("failed to follow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.FollowResponse]{
		Msg: &v1.FollowResponse{},
	}, nil
}

func (h *userHandler) Unfollow(ctx context.Context, req *connect.Request[v1.UnfollowRequest]) (*connect.Response[v1.UnfollowResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.Unfollow(ctx, repo.UnfollowParams{
		FollowerID: userID,
		FolloweeID: req.Msg.GetUnfollowId(),
	}); err != nil {
		log.Error("failed to unfollow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.UnfollowResponse]{
		Msg: &v1.UnfollowResponse{},
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
