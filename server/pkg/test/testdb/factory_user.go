package testdb

import (
	"context"
	"fmt"
	"time"

	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

type UserOpt func(event *orm.User)

func (f *Factory) NewUser(opts ...UserOpt) *orm.User {
	m := &orm.User{
		ID:        f.NewAuth().ID,
		FirstName: "",
		LastName:  "",
		CreatedAt: time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert user: %w", err))
	}

	return m
}

func UserID(id string) UserOpt {
	return func(m *orm.User) {
		m.ID = id
	}
}
