//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Auth(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewAuth()
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.Email, created.Email)
		require.Equal(t, expected.Password, created.Password)
		require.Equal(t, expected.RefreshToken, created.RefreshToken)
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
		require.Equal(t, expected.EmailVerified, created.EmailVerified)
		require.Equal(t, expected.EmailToken, created.EmailToken)
		require.Equal(t, expected.PasswordResetToken, created.PasswordResetToken)
	})

	t.Run("AuthID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewAuth(factory.AuthID(id))
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID)
	})

	t.Run("AuthEmail", func(t *testing.T) {
		t.Parallel()
		email := gofakeit.Email()
		expected := f.NewAuth(factory.AuthEmail(email))
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, email, created.Email)
	})

	t.Run("AuthPassword", func(t *testing.T) {
		t.Parallel()
		refreshToken := uuid.NewString()
		expected := f.NewAuth(factory.AuthRefreshToken(refreshToken))
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, refreshToken, created.RefreshToken.String)
	})

	t.Run("AuthEmailVerified", func(t *testing.T) {
		t.Parallel()
		passwordResetToken := uuid.NewString()
		expected := f.NewAuth(factory.AuthPasswordResetToken(passwordResetToken))
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, passwordResetToken, created.PasswordResetToken.String)
	})

	t.Run("AuthRefreshToken", func(t *testing.T) {
		t.Parallel()
		password := uuid.NewString()
		expected := f.NewAuth(factory.AuthPassword(password))
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.NoError(t, bcrypt.CompareHashAndPassword(created.Password, []byte(password)))
	})

	t.Run("AuthEmailVerified", func(t *testing.T) {
		t.Parallel()
		expected := f.NewAuth(factory.AuthEmailVerified())
		created, err := orm.FindAuth(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.True(t, created.EmailVerified)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
