package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc"
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

	user, err := h.repo.GetUser(
		ctx,
		repo.GetUserWithID(req.Msg.GetId()),
		repo.GetUserLoadAuth(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("User not found")
			return nil, connect.NewError(connect.CodeNotFound, nil)
		}

		log.Error("Get user by ID", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followed, err := h.repo.IsUserFollowedByUserID(ctx, user, userID)
	if err != nil {
		log.Error("Check if user is followed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.GetUserResponse]{
		Msg: &apiv1.GetUserResponse{
			User: parser.User(user, parser.UserFollowed(followed)),
		},
	}, nil
}

func (h *userHandler) SearchUsers(ctx context.Context, req *connect.Request[apiv1.SearchUsersRequest]) (*connect.Response[apiv1.SearchUsersResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	users, err := h.repo.ListUsers(
		ctx,
		repo.ListUsersWithLimit(limit+1),
		repo.ListUsersWithNameMatching(req.Msg.GetQuery()),
	)
	if err != nil {
		log.Error("Search users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	pagination, err := repo.PaginateSlice(users, limit, func(user *models.User) time.Time {
		return user.CreatedAt
	})
	if err != nil {
		log.Error("Paginate user search results", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Searched users")
	return &connect.Response[apiv1.SearchUsersResponse]{
		Msg: &apiv1.SearchUsersResponse{
			Users: parser.UserSlice(pagination.Items),
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
		log.Error("Follow user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	h.pubSub.Publish(ctx, repo.EventTopicFollowedUser, payloads.UserFollowed{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
		EventID:    uuid.NewString(),
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
		log.Error("Unfollow user", zap.Error(err))
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
		log.Error("List followers", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListFollowersResponse]{
		Msg: &apiv1.ListFollowersResponse{
			Followers: parser.UserSlice(followers),
		},
	}, nil
}

func (h *userHandler) UpdateUserName(ctx context.Context, req *connect.Request[apiv1.UpdateUserNameRequest]) (*connect.Response[apiv1.UpdateUserNameResponse], error) {
	user, err := h.updateUserPreference(ctx, "name", repo.UpdateUserName(req.Msg.GetName()))
	if err != nil {
		return nil, err
	}

	return &connect.Response[apiv1.UpdateUserNameResponse]{
		Msg: &apiv1.UpdateUserNameResponse{
			User: user,
		},
	}, nil
}

func (h *userHandler) UpdateUserUsername(ctx context.Context, req *connect.Request[apiv1.UpdateUserUsernameRequest]) (*connect.Response[apiv1.UpdateUserUsernameResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.UpdateUser(ctx, userID, repo.UpdateUserUsername(req.Msg.GetUsername())); err != nil {
		if errors.Is(err, repo.ErrUserUsernameExists) {
			log.Warn("Username already taken")
			return nil, rpc.Error(connect.CodeAlreadyExists, apiv1.Error_ERROR_USERNAME_TAKEN)
		}

		log.Error("Update user username", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(userID))
	if err != nil {
		log.Error("Get user after username update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Username updated")
	return &connect.Response[apiv1.UpdateUserUsernameResponse]{
		Msg: &apiv1.UpdateUserUsernameResponse{
			User: parser.User(user),
		},
	}, nil
}

func (h *userHandler) UpdateUserWeightUnit(ctx context.Context, req *connect.Request[apiv1.UpdateUserWeightUnitRequest]) (*connect.Response[apiv1.UpdateUserWeightUnitResponse], error) {
	weightUnit := parser.WeightUnitFromProto(req.Msg.GetWeightUnit())
	user, err := h.updateUserPreference(ctx, "weight unit", repo.UpdateUserWeightUnit(weightUnit))
	if err != nil {
		return nil, err
	}

	return &connect.Response[apiv1.UpdateUserWeightUnitResponse]{
		Msg: &apiv1.UpdateUserWeightUnitResponse{
			User: user,
		},
	}, nil
}

func (h *userHandler) UpdateUserAutofillSets(ctx context.Context, req *connect.Request[apiv1.UpdateUserAutofillSetsRequest]) (*connect.Response[apiv1.UpdateUserAutofillSetsResponse], error) {
	user, err := h.updateUserPreference(ctx, "set autofill", repo.UpdateUserAutofillSets(req.Msg.GetEnabled()))
	if err != nil {
		return nil, err
	}

	return &connect.Response[apiv1.UpdateUserAutofillSetsResponse]{
		Msg: &apiv1.UpdateUserAutofillSetsResponse{
			User: user,
		},
	}, nil
}

func (h *userHandler) UpdateUserDistanceUnit(ctx context.Context, req *connect.Request[apiv1.UpdateUserDistanceUnitRequest]) (*connect.Response[apiv1.UpdateUserDistanceUnitResponse], error) {
	distanceUnit := parser.DistanceUnitFromProto(req.Msg.GetDistanceUnit())
	user, err := h.updateUserPreference(ctx, "distance unit", repo.UpdateUserDistanceUnit(distanceUnit))
	if err != nil {
		return nil, err
	}

	return &connect.Response[apiv1.UpdateUserDistanceUnitResponse]{
		Msg: &apiv1.UpdateUserDistanceUnitResponse{
			User: user,
		},
	}, nil
}

func (h *userHandler) updateUserPreference(ctx context.Context, preference string, opt repo.UpdateUserOpt) (*apiv1.User, error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.UpdateUser(ctx, userID, opt); err != nil {
		log.Error(fmt.Sprintf("Update user %s", preference), zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(userID))
	if err != nil {
		log.Error("Get user after preference update", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info(fmt.Sprintf("User %s updated", preference))
	return parser.User(user), nil
}

func (h *userHandler) ListFollowees(ctx context.Context, req *connect.Request[apiv1.ListFolloweesRequest]) (*connect.Response[apiv1.ListFolloweesResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	followees, err := h.repo.ListFollowees(ctx, req.Msg.GetFolloweeId())
	if err != nil {
		log.Error("List followees", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListFolloweesResponse]{
		Msg: &apiv1.ListFolloweesResponse{
			Followees: parser.UserSlice(followees),
		},
	}, nil
}
