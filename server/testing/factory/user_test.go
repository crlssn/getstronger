//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_User(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewUserSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewUser()
		created, err := models.FindUser(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.AuthID, created.AuthID)
		require.Equal(t, expected.Name, created.Name)
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
	})

	t.Run("UserID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewUser(factory.UserID(id))
		created, err := models.FindUser(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID.String())
	})

	t.Run("UserAuthID", func(t *testing.T) {
		t.Parallel()
		authID := f.NewAuth().ID
		expected := f.NewUser(factory.UserAuthID(authID))
		created, err := models.FindUser(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, authID, created.AuthID)
	})

	t.Run("UserName", func(t *testing.T) {
		t.Parallel()
		name := gofakeit.Name()
		expected := f.NewUser(factory.UserName(name))
		created, err := models.FindUser(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, name, created.Name)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
