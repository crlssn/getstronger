package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.NotificationServiceHandler = (*notificationHandler)(nil)

type notificationHandler struct {
	repo *repo.Repo
}

func NewNotificationHandler(r *repo.Repo) apiv1connect.NotificationServiceHandler {
	return &notificationHandler{r}
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
		log.Error("List notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	paginated, err := repo.PaginateSlice(notifications, limit, func(n *notification.Notification) (time.Time, uuid.UUID) {
		return n.CreatedAt, n.ID
	})
	if err != nil {
		log.Error("Paginate notifications", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	var actorIDs []uuid.UUID
	var workoutIDs []uuid.UUID

	for _, n := range paginated.Items {
		if !n.Payload.ActorID.IsNil() {
			actorIDs = append(actorIDs, n.Payload.ActorID)
		}
		if !n.Payload.WorkoutID.IsNil() {
			workoutIDs = append(workoutIDs, n.Payload.WorkoutID)
		}
	}

	actors, err := h.repo.ListUsers(ctx, repo.ListUsersWithIDs(actorIDs))
	if err != nil {
		log.Error("List notification actors", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	workouts, err := h.repo.ListWorkouts(
		ctx,
		repo.ListWorkoutsWithIDs(workoutIDs),
		repo.ListWorkoutsLoadUser(),
	)
	if err != nil {
		log.Error("List notification workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.ListNotificationsResponse]{
		Msg: &apiv1.ListNotificationsResponse{
			Notifications: parser.NotificationSlice(paginated.Items, actors, workouts),
			Pagination: &apiv1.PaginationResponse{
				NextPageToken: paginated.NextPageToken,
			},
		},
	}, nil
}

func (h *notificationHandler) MarkNotificationsAsRead(ctx context.Context, req *connect.Request[apiv1.MarkNotificationsAsReadRequest]) (*connect.Response[apiv1.MarkNotificationsAsReadResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	notificationID, err := notificationIDFromRequest(req.Msg)
	if err != nil {
		return nil, err
	}

	if err = h.repo.MarkNotificationsAsRead(ctx, userID, notificationID); err != nil {
		log.Error("Mark notifications as read", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	return &connect.Response[apiv1.MarkNotificationsAsReadResponse]{}, nil
}

func (h *notificationHandler) GetUnreadNotificationCount(ctx context.Context, _ *connect.Request[apiv1.GetUnreadNotificationCountRequest]) (*connect.Response[apiv1.GetUnreadNotificationCountResponse], error) {
	userID := xcontext.MustExtractUserID(ctx)
	count, err := h.countUnreadNotifications(ctx, userID)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&apiv1.GetUnreadNotificationCountResponse{Count: count}), nil
}

func (h *notificationHandler) countUnreadNotifications(ctx context.Context, userID uuid.UUID) (int64, error) {
	count, err := h.repo.CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(userID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	if err != nil {
		log := xcontext.MustExtractLogger(ctx)
		log.Error("Count notifications", zap.Error(err))
		return 0, connect.NewError(connect.CodeInternal, nil)
	}

	return count, nil
}

// notificationIDFromRequest reads the one notification a request marks read, or
// nothing at all when it marks the lot.
func notificationIDFromRequest(msg *apiv1.MarkNotificationsAsReadRequest) (*uuid.UUID, error) {
	if msg.NotificationId == nil {
		return nil, nil //nolint:nilnil // No id is the request to mark them all.
	}

	notificationID, err := parser.UUID(msg.GetNotificationId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	return &notificationID, nil
}
