package v1

import (
	"context"
	"encoding/json"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/bus/events"
	"github.com/crlssn/getstronger/server/bus/payloads"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
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

func (h *userHandler) Get(ctx context.Context, req *connect.Request[v1.GetUserRequest]) (*connect.Response[v1.GetUserResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	user, err := h.repo.GetUser(ctx, repo.GetUserWithID(req.Msg.GetId()))
	if err != nil {
		log.Error("failed to get user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	followed, err := h.repo.IsUserFollowedByUserID(ctx, user, userID)
	if err != nil {
		log.Error("failed to check if user is followed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[v1.GetUserResponse]{
		Msg: &v1.GetUserResponse{
			User: parseUserToPB(user, followed),
		},
	}, nil
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

	if err := h.bus.Publish(events.UserFollowed, payloads.UserFollowed{
		FollowerID: userID,
		FolloweeID: req.Msg.GetFollowId(),
	}); err != nil {
		log.Error("failed to publish user followed event", zap.Error(err))
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

func (h *userHandler) ListNotifications(ctx context.Context, req *connect.Request[v1.ListNotificationsRequest]) (*connect.Response[v1.ListNotificationsResponse], error) { //nolint:cyclop // TODO: Simplify this method.
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	total, err := h.repo.CountNotifications(ctx,
		repo.CountNotificationsWithUserID(userID),
		repo.CountNotificationsWithUnreadOnly(req.Msg.GetUnreadOnly()),
	)
	if err != nil {
		log.Error("failed to count notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	limit := int(req.Msg.GetPagination().GetPageLimit())
	notifications, err := h.repo.ListNotifications(ctx,
		repo.ListNotificationsWithLimit(limit+1),
		repo.ListNotificationsWithUserID(userID),
		repo.ListNotificationsWithOnlyUnread(req.Msg.GetUnreadOnly()),
		repo.ListNotificationsOrderByCreatedAtDESC(),
	)
	if err != nil {
		log.Error("failed to list notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(notifications, limit, func(n *orm.Notification) time.Time {
		return n.CreatedAt
	})
	if err != nil {
		log.Error("failed to paginate notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	var userIDs []string
	var workoutIDs []string
	payloads := make(map[string]repo.NotificationPayload)

	for _, n := range paginated.Items {
		var payload repo.NotificationPayload
		if err = json.Unmarshal(n.Payload, &payload); err != nil {
			log.Error("failed to unmarshal notification payload", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		payloads[n.ID] = payload
		if payload.WorkoutID != "" {
			workoutIDs = append(workoutIDs, payload.WorkoutID)
		}
		if payload.ActorID != "" {
			userIDs = append(userIDs, payload.ActorID)
		}
	}

	users, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(userIDs))
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workouts, err := h.repo.ListWorkouts(ctx, repo.ListWorkoutsWithIDs(workoutIDs))
	if err != nil {
		log.Error("failed to list workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if req.Msg.GetMarkAsRead() {
		if err = h.repo.MarkNotificationsAsRead(ctx, repo.MarkNotificationsAsReadByUserID(userID)); err != nil {
			log.Error("failed to mark notifications as read", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	return &connect.Response[v1.ListNotificationsResponse]{
		Msg: &v1.ListNotificationsResponse{
			Notifications: parseNotificationSliceToPB(paginated.Items, payloads, users, workouts),
			Pagination: &v1.PaginationResponse{
				TotalResults:  total,
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}
