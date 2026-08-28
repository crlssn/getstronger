package pubsub_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

// The module binds one repo to four ports and subscribes every topic on start.
// A subscriber that grows a dependency and is left unbound shows up here as a
// graph that will not build.
func TestModuleSubscribesEveryTopic(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	f := factory.NewFactory(c.DB)
	follower := f.NewUser()
	followee := f.NewUser()

	var bus *pubsub.PubSub
	app := fx.New(
		pubsub.Module(),
		fx.Provide(func() *sql.DB { return c.DB }, repo.New, zap.NewExample),
		fx.Populate(&bus),
		fx.NopLogger,
	)
	require.NoError(t, app.Err())
	require.NoError(t, app.Start(ctx))

	bus.Publish(ctx, events.TopicFollowedUser, events.UserFollowed{
		FollowerID: follower.ID.String(),
		FolloweeID: followee.ID.String(),
		EventID:    "event",
	})

	// Stop drains the queue and waits for the workers out, so the subscriber
	// has run by the time it returns.
	require.NoError(t, app.Stop(ctx))

	notified, err := models.Notifications.Query(
		models.SelectWhere.Notifications.UserID.EQ(followee.ID),
	).Exists(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.True(t, notified)
}
