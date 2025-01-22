package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/repo"
)

func (f *Factory) NewAuthSlice(count int, opts ...AuthOpt) orm.AuthSlice {
	var slice orm.AuthSlice
	for range count {
		slice = append(slice, f.NewAuth(opts...))
	}

	return slice
}

type AuthOpt func(event *orm.Auth)

func (f *Factory) NewAuth(opts ...AuthOpt) *orm.Auth {
	m := &orm.Auth{
		ID:                           uuid.NewString(),
		Email:                        fmt.Sprintf("%s-%s", uuid.NewString(), f.faker.Email()),
		Password:                     nil,
		RefreshToken:                 null.String{},
		CreatedAt:                    time.Time{},
		EmailVerified:                false,
		EmailToken:                   "",
		PasswordResetToken:           null.String{},
		PasswordResetTokenValidUntil: null.Time{},
	}

	if m.Password == nil {
		m.Password = repo.MustHashPassword("password")
	}

	for _, opt := range opts {
		opt(m)
	}

	insertColumns := boil.Infer()
	updateColumns := boil.Infer()
	conflictColumns := []string{orm.AuthColumns.ID}
	if err := m.Upsert(context.Background(), f.db, true, conflictColumns, updateColumns, insertColumns); err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}

	return m
}

func AuthID(id string) AuthOpt {
	return func(m *orm.Auth) {
		m.ID = id
	}
}

func AuthEmail(email string) AuthOpt {
	return func(m *orm.Auth) {
		m.Email = email
	}
}

func AuthEmailToken(token string) AuthOpt {
	return func(m *orm.Auth) {
		m.EmailToken = token
	}
}

func AuthEmailVerified() AuthOpt {
	return func(m *orm.Auth) {
		m.EmailVerified = true
	}
}

func AuthRefreshToken(token string) AuthOpt {
	return func(m *orm.Auth) {
		m.RefreshToken = null.StringFrom(token)
	}
}

func AuthPasswordResetToken(token string, ttl time.Duration) AuthOpt {
	return func(m *orm.Auth) {
		m.PasswordResetToken = null.StringFrom(token)
		m.PasswordResetTokenValidUntil = null.TimeFrom(time.Now().UTC().Add(ttl))
	}
}

func AuthPassword(password string) AuthOpt {
	return func(m *orm.Auth) {
		m.Password = repo.MustHashPassword(password)
	}
}
