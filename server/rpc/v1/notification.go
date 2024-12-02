package v1

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/emptypb"

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

func (h *notificationHandler) UnreadNotifications(ctx context.Context, _ *connect.Request[emptypb.Empty], res *connect.ServerStream[v1.UnreadNotificationsStream]) error {
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

			if err = res.Send(&v1.UnreadNotificationsStream{
				Count: count,
			}); err != nil {
				log.Error("failed to send unread notifications", zap.Error(err))
				return connect.NewError(connect.CodeInternal, nil)
			}
		}
	}
}
