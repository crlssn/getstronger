package v1

import (
	"context"
	"encoding/json"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/stream"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.NotificationServiceHandler = (*notificationHandler)(nil)

type notificationHandler struct {
	repo   repo.Repo
	stream *stream.Manager
}

func NewNotificationHandler(r repo.Repo, s *stream.Manager) apiv1connect.NotificationServiceHandler {
	return &notificationHandler{r, s}
}

func (h *notificationHandler) ListNotifications(ctx context.Context, req *connect.Request[apiv1.ListNotificationsRequest]) (*connect.Response[apiv1.ListNotificationsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	notifications, err := h.repo.ListNotifications(
		ctx,
		repo.ListNotificationsWithLimit(limit+1),
		repo.ListNotificationsWithUserID(userID),
		repo.ListNotificationsWithPageToken(req.Msg.GetPagination().GetPageToken()),
	)
	if err != nil {
		log.Error("failed to list notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(notifications, limit, func(n *models.Notification) time.Time {
		return n.CreatedAt
	})
	if err != nil {
		log.Error("failed to paginate notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	var actorIDs []string
	var workoutIDs []string

	for _, n := range paginated.Items {
		var payload repo.NotificationPayload
		if err = json.Unmarshal(n.Payload.Val, &payload); err != nil {
			log.Error("failed to unmarshal notification payload", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		if payload.ActorID != "" {
			actorIDs = append(actorIDs, payload.ActorID)
		}
		if payload.WorkoutID != "" {
			workoutIDs = append(workoutIDs, payload.WorkoutID)
		}
	}

	actors, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(actorIDs))
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workouts, err := h.repo.ListWorkouts(
		ctx,
		repo.ListWorkoutsWithIDs(workoutIDs),
		repo.ListWorkoutsLoadUser(),
	)
	if err != nil {
		log.Error("failed to list workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	notificationSlice, err := parser.NotificationSlice(paginated.Items, actors, workouts)
	if err != nil {
		log.Error("failed to parse notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListNotificationsResponse]{
		Msg: &apiv1.ListNotificationsResponse{
			Notifications: notificationSlice,
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}

func (h *notificationHandler) MarkNotificationsAsRead(ctx context.Context, _ *connect.Request[apiv1.MarkNotificationsAsReadRequest]) (*connect.Response[apiv1.MarkNotificationsAsReadResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	if err := h.repo.MarkNotificationsAsRead(ctx, userID); err != nil {
		log.Error("failed to mark notifications as read", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	h.stream.Notify(userID)

	return &connect.Response[apiv1.MarkNotificationsAsReadResponse]{}, nil
}

func (h *notificationHandler) UnreadNotifications(ctx context.Context, _ *connect.Request[apiv1.UnreadNotificationsRequest], res *connect.ServerStream[apiv1.UnreadNotificationsResponse]) error {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	ctx, cancelFunc := context.WithCancel(ctx)
	defer cancelFunc()
	updates, unsubscribe := h.stream.Subscribe(userID, cancelFunc)
	defer unsubscribe()

	lastCount, err := h.sendUnreadNotificationCount(ctx, userID, res)
	if err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			log.Debug("client disconnected")
			return nil
		case <-updates:
			count, err := h.repo.CountNotifications(
				ctx,
				repo.CountNotificationsWithUserID(userID),
				repo.CountNotificationsWithUnreadOnly(true),
			)
			if err != nil {
				log.Error("failed to count notifications", zap.Error(err))
				return connect.NewError(connect.CodeInternal, nil)
			}

			if count == lastCount {
				continue
			}
			lastCount = count

			if err = res.Send(&apiv1.UnreadNotificationsResponse{
				Count: count,
			}); err != nil {
				log.Error("failed to send unread notifications", zap.Error(err))
				return connect.NewError(connect.CodeInternal, nil)
			}
		}
	}
}

func (h *notificationHandler) sendUnreadNotificationCount(
	ctx context.Context,
	userID string,
	res *connect.ServerStream[apiv1.UnreadNotificationsResponse],
) (int64, error) {
	log := xcontext.MustExtractLogger(ctx)
	count, err := h.repo.CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(userID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	if err != nil {
		log.Error("failed to count notifications", zap.Error(err))
		return 0, connect.NewError(connect.CodeInternal, nil)
	}

	if err = res.Send(&apiv1.UnreadNotificationsResponse{Count: count}); err != nil {
		log.Error("failed to send unread notifications", zap.Error(err))
		return 0, connect.NewError(connect.CodeInternal, nil)
	}

	return count, nil
}
