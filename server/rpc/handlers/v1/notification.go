package v1

import (
	"context"
	"encoding/json"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
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
	stream *stream.Conn
}

func NewNotificationHandler(r repo.Repo, s *stream.Conn) apiv1connect.NotificationServiceHandler {
	return &notificationHandler{r, s}
}

func (h *notificationHandler) ListNotifications(ctx context.Context, req *connect.Request[apiv1.ListNotificationsRequest]) (*connect.Response[apiv1.ListNotificationsResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	limit := int(req.Msg.GetPagination().GetPageLimit())
	notifications, err := h.repo.ListNotifications(ctx,
		repo.ListNotificationsWithLimit(limit+1),
		repo.ListNotificationsWithUserID(userID),
		repo.ListNotificationsWithPageToken(req.Msg.GetPagination().GetPageToken()),
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
	nPayloads := make(map[string]repo.NotificationPayload)

	for _, n := range paginated.Items {
		var payload repo.NotificationPayload
		if err = json.Unmarshal(n.Payload, &payload); err != nil {
			log.Error("failed to unmarshal notification payload", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		nPayloads[n.ID] = payload
		if payload.ActorID != "" {
			userIDs = append(userIDs, payload.ActorID)
		}
		if payload.WorkoutID != "" {
			workoutIDs = append(workoutIDs, payload.WorkoutID)
		}
	}

	users, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(userIDs))
	if err != nil {
		log.Error("failed to list users", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workouts, err := h.repo.ListWorkouts(ctx,
		repo.ListWorkoutsWithIDs(workoutIDs),
		repo.ListWorkoutsWithUser(),
	)
	if err != nil {
		log.Error("failed to list workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListNotificationsResponse]{
		Msg: &apiv1.ListNotificationsResponse{
			Notifications: parser.NotificationSliceToPB(paginated.Items, nPayloads, users, workouts),
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

	return &connect.Response[apiv1.MarkNotificationsAsReadResponse]{}, nil
}

func (h *notificationHandler) UnreadNotifications(ctx context.Context, _ *connect.Request[apiv1.UnreadNotificationsRequest], res *connect.ServerStream[apiv1.UnreadNotificationsResponse]) error {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	ctx, cancelFunc := context.WithCancel(ctx)
	h.stream.Add(userID, cancelFunc)
	defer h.stream.Remove(userID)

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	var lastCount int64
	for {
		select {
		case <-ctx.Done():
			log.Info("client disconnected")
			return nil
		case <-ticker.C:
			count, err := h.repo.CountNotifications(ctx,
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
