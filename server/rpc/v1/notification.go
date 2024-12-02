package v1

import (
	"context"
	"encoding/json"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

var _ apiv1connect.NotificationServiceHandler = (*notificationHandler)(nil)

type notificationHandler struct {
	repo *repo.Repo
}

func NewNotificationHandler(r *repo.Repo) apiv1connect.NotificationServiceHandler {
	return &notificationHandler{r}
}

func (h *notificationHandler) ListNotifications(ctx context.Context, req *connect.Request[v1.ListNotificationsRequest]) (*connect.Response[v1.ListNotificationsResponse], error) { //nolint:cyclop // TODO: Simplify this method.
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
			Notifications: parseNotificationSliceToPB(paginated.Items, nPayloads, users, workouts),
			Pagination: &v1.PaginationResponse{
				TotalResults:  total,
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}

func (h *notificationHandler) UnreadNotifications(ctx context.Context, _ *connect.Request[v1.UnreadNotificationsRequest], res *connect.ServerStream[v1.UnreadNotificationsResponse]) error {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

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

			if err = res.Send(&v1.UnreadNotificationsResponse{
				Count: count,
			}); err != nil {
				log.Error("failed to send unread notifications", zap.Error(err))
				return connect.NewError(connect.CodeInternal, nil)
			}
		}
	}
}
