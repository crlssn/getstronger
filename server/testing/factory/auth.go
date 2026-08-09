package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/repo"
)

func (f *Factory) NewAuthSlice(count int, opts ...AuthOpt) models.AuthSlice {
	slice := make(models.AuthSlice, 0, count)
	for range count {
		slice = append(slice, f.NewAuth(opts...))
	}

	return slice
}

type AuthOpt func(event *models.AuthSetter)

func (f *Factory) NewAuth(opts ...AuthOpt) *models.Auth {
	m := &models.AuthSetter{
		ID:    omit.From(uuid.NewString()),
		Email: omit.From(fmt.Sprintf("%s-%s", uuid.NewString(), f.Faker.Email())),
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.Password.IsUnset() {
		m.Password = omit.From(repo.MustHashPassword("password"))
	}

	auth, err := models.Auths.Insert(m,
		im.OnConflict(models.Auths.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(context.Background(), bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}

	return auth
}

func AuthID(id string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.ID = omit.From(id)
	}
}

func AuthEmail(email string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.Email = omit.From(email)
	}
}

func AuthEmailToken(token string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.EmailToken = omit.From(token)
	}
}

func AuthEmailVerified() AuthOpt {
	return func(m *models.AuthSetter) {
		m.EmailVerified = omit.From(true)
	}
}

func AuthRefreshToken(token string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.RefreshToken = omitnull.From(token)
	}
}

func AuthPasswordResetToken(token string, ttl time.Duration) AuthOpt {
	return func(m *models.AuthSetter) {
		m.PasswordResetToken = omitnull.From(token)
		// Truncate to microseconds to unify precision across different databases.
		m.PasswordResetTokenValidUntil = omitnull.From(time.Now().UTC().Add(ttl).Truncate(time.Microsecond))
	}
}

func AuthPassword(password string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.Password = omit.From(repo.MustHashPassword(password))
	}
}
