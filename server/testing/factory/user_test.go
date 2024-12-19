//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_User(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewUser()
		created, err := orm.FindUser(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.AuthID, created.AuthID)
		require.Equal(t, expected.FirstName, created.FirstName)
		require.Equal(t, expected.LastName, created.LastName)
		require.Equal(t, expected.CreatedAt, created.CreatedAt)
	})

	t.Run("UserID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewUser(factory.UserID(id))
		created, err := orm.FindUser(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID)
	})

	t.Run("UserAuthID", func(t *testing.T) {
		t.Parallel()
		authID := f.NewAuth().ID
		expected := f.NewUser(factory.UserAuthID(authID))
		created, err := orm.FindUser(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, authID, created.AuthID)
	})

	t.Run("UserFirstName", func(t *testing.T) {
		t.Parallel()
		firstName := gofakeit.FirstName()
		expected := f.NewUser(factory.UserFirstName(firstName))
		created, err := orm.FindUser(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, firstName, created.FirstName)
	})

	t.Run("UserLastName", func(t *testing.T) {
		t.Parallel()
		lastName := gofakeit.LastName()
		expected := f.NewUser(factory.UserLastName(lastName))
		created, err := orm.FindUser(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, lastName, created.LastName)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
