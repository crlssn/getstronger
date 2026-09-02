package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/stephenafamo/bob/dialect/psql/im"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
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

type AuthOpt func(auth *models.AuthSetter)

func (f *Factory) NewAuth(opts ...AuthOpt) *models.Auth { //nolint:cyclop // Maps optional fixture fields to generated Bob mods.
	setter := &models.AuthSetter{
		ID:    omit.From(newUUID()),
		Email: omit.From(fmt.Sprintf("%s-%s", newUUID(), f.Faker.Email())),
	}
	for _, opt := range opts {
		opt(setter)
	}
	if setter.Password.IsUnset() {
		setter.Password = omit.From(repo.MustHashPassword("password"))
	}

	mods := make([]bobfactory.AuthMod, 0)
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.AuthMods.ID(value))
	}
	if value, ok := setter.Email.Get(); ok {
		mods = append(mods, bobfactory.AuthMods.Email(value))
	}
	if value, ok := setter.Password.Get(); ok {
		mods = append(mods, bobfactory.AuthMods.Password(value))
	}
	if value, ok := setter.RefreshToken.GetNull(); ok {
		mods = append(mods, bobfactory.AuthMods.RefreshToken(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.AuthMods.CreatedAt(value))
	}
	if value, ok := setter.EmailVerified.Get(); ok {
		mods = append(mods, bobfactory.AuthMods.EmailVerified(value))
	}
	if value, ok := setter.EmailToken.Get(); ok {
		mods = append(mods, bobfactory.AuthMods.EmailToken(value))
	}
	if value, ok := setter.PasswordResetToken.GetNull(); ok {
		mods = append(mods, bobfactory.AuthMods.PasswordResetToken(value))
	}
	if value, ok := setter.PasswordResetTokenValidUntil.GetNull(); ok {
		mods = append(mods, bobfactory.AuthMods.PasswordResetTokenValidUntil(value))
	}
	if value, ok := setter.EmailVerificationSentAt.GetNull(); ok {
		mods = append(mods, bobfactory.AuthMods.EmailVerificationSentAt(value))
	}

	template := f.generated.NewAuth(mods...)
	setter = template.BuildSetter()
	auth, err := models.Auths.Insert(
		setter,
		im.OnConflict(models.Auths.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("create auth with Bob factory: %w", err))
	}

	f.remember(auth.ID, auth)

	return auth
}

func AuthID(id any) AuthOpt {
	return func(m *models.AuthSetter) {
		m.ID = omit.From(nativeUUID(id))
	}
}

func AuthEmail(email string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.Email = omit.From(email)
	}
}

func AuthEmailToken(token any) AuthOpt {
	return func(m *models.AuthSetter) {
		m.EmailToken = omit.From(nativeUUID(token))
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

func AuthPasswordResetToken(token any, ttl time.Duration) AuthOpt {
	return func(m *models.AuthSetter) {
		m.PasswordResetToken = omitnull.From(nativeUUID(token))
		m.PasswordResetTokenValidUntil = omitnull.From(time.Now().UTC().Add(ttl).Truncate(time.Microsecond))
	}
}

func AuthEmailVerificationSentAt(sentAt time.Time) AuthOpt {
	return func(m *models.AuthSetter) {
		m.EmailVerificationSentAt = omitnull.From(sentAt.UTC().Truncate(time.Microsecond))
	}
}

func AuthPassword(password string) AuthOpt {
	return func(m *models.AuthSetter) {
		m.Password = omit.From(repo.MustHashPassword(password))
	}
}
