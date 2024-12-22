package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"golang.org/x/crypto/bcrypt"

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
	bcryptPassword, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	if err != nil {
		panic(fmt.Errorf("bcrypt password generation: %w", err))
	}

	m := &orm.Auth{
		ID:                 uuid.NewString(),
		Email:              fmt.Sprintf("%s-%s", uuid.NewString(), f.faker.Email()),
		Password:           bcryptPassword,
		RefreshToken:       null.String{},
		CreatedAt:          time.Time{},
		EmailVerified:      false,
		EmailToken:         "",
		PasswordResetToken: null.String{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if err = m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
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

func AuthPasswordResetToken(token string) AuthOpt {
	return func(m *orm.Auth) {
		m.PasswordResetToken = null.StringFrom(token)
	}
}

func AuthPassword(password string) AuthOpt {
	return func(m *orm.Auth) {
		m.Password = repo.MustHashPassword(password)
	}
}
