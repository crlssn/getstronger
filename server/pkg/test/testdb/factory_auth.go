package testdb

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

type AuthOpt func(event *orm.Auth)

func (f *Factory) NewAuth(opts ...AuthOpt) *orm.Auth {
	m := &orm.Auth{
		ID:           uuid.NewString(),
		Email:        f.faker.Email(),
		Password:     []byte("password"),
		RefreshToken: null.String{},
		CreatedAt:    time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	boil.DebugMode = f.debug
	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}
	boil.DebugMode = false

	return m
}

func AuthID(id string) AuthOpt {
	return func(m *orm.Auth) {
		m.ID = id
	}
}
